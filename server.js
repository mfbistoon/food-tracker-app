const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const PORT = process.env.PORT || 3000;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Password gate for all API routes. Unset locally = open; on Vercel it must be set.
function requirePassword(req, res, next) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    if (process.env.VERCEL) {
      return res.status(503).json({ error: 'Server is not configured: set APP_PASSWORD in the Vercel project settings.' });
    }
    return next();
  }
  const given = Buffer.from(String(req.get('x-app-password') || ''));
  const want = Buffer.from(expected);
  if (given.length === want.length && crypto.timingSafeEqual(given, want)) return next();
  res.status(401).json({ error: 'Wrong or missing password.', code: 'auth' });
}
app.use('/api', requirePassword);
app.get('/api/auth', (req, res) => res.json({ ok: true }));

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY is not set. Add it to .env and restart the server.');
    err.status = 500;
    throw err;
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const num = (v, max) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, max) * 10) / 10;
};

const MEAL_TOOL = {
  name: 'record_meal',
  description: 'Record the estimated nutrition of the meal shown in the photo.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short name for the meal, e.g. "Chicken burrito bowl"' },
      items: {
        type: 'array',
        description: 'Each distinct food item visible',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            portion: { type: 'string', description: 'Estimated portion, e.g. "1 cup" or "150 g"' },
            calories: { type: 'number' },
            protein_g: { type: 'number' },
            carbs_g: { type: 'number' },
            fat_g: { type: 'number' },
          },
          required: ['name', 'portion', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
        },
      },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      notes: { type: 'string', description: 'Assumptions or caveats about the estimate' },
    },
    required: ['name', 'items', 'confidence'],
  },
};

app.post('/api/analyze', async (req, res) => {
  try {
    const { image, mediaType, note } = req.body || {};
    if (!image || !ALLOWED_TYPES.includes(mediaType)) {
      return res.status(400).json({ error: 'A base64 image (jpeg, png, webp or gif) is required.' });
    }
    const content = [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
      {
        type: 'text',
        text:
          'Estimate the calories and macros (protein, carbs, fat in grams) of the food in this photo. ' +
          'Identify each item, estimate its portion size from visual cues, and call record_meal. ' +
          'If the image does not contain food, return a single item named "No food detected" with zeros and low confidence.' +
          (note ? `\n\nThe user adds: ${String(note).slice(0, 500)}` : ''),
      },
    ];
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1500,
      tools: [MEAL_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content }],
    });
    const block = msg.content.find((b) => b.type === 'tool_use');
    if (!block) throw new Error('The model did not return an estimate.');
    const r = block.input;
    const items = (Array.isArray(r.items) ? r.items : []).map((i) => ({
      name: String(i.name || 'Item').slice(0, 100),
      portion: String(i.portion || '').slice(0, 60),
      calories: num(i.calories, 5000),
      protein_g: num(i.protein_g, 500),
      carbs_g: num(i.carbs_g, 800),
      fat_g: num(i.fat_g, 500),
    }));
    const sum = (k) => Math.round(items.reduce((a, i) => a + i[k], 0) * 10) / 10;
    res.json({
      name: String(r.name || 'Meal').slice(0, 100),
      items,
      totals: {
        calories: Math.round(sum('calories')),
        protein_g: sum('protein_g'),
        carbs_g: sum('carbs_g'),
        fat_g: sum('fat_g'),
      },
      confidence: ['low', 'medium', 'high'].includes(r.confidence) ? r.confidence : 'medium',
      notes: String(r.notes || '').slice(0, 500),
    });
  } catch (err) {
    console.error('analyze error:', err.message);
    res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 500).json({
      error: err.message || 'Analysis failed.',
    });
  }
});

app.post('/api/advice', async (req, res) => {
  try {
    const { goals, days } = req.body || {};
    if (!Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: 'No logs to analyze yet.' });
    }
    const payload = JSON.stringify({ goals, days: days.slice(-30) });
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1200,
      system:
        'You are a supportive, practical nutrition coach reviewing someone\'s food log. ' +
        'Values are AI photo estimates, so be approximate. Respond in concise Markdown with these sections: ' +
        '"## What I notice" (2-4 bullets on patterns, e.g. calorie consistency, protein, meal timing, standout meals), ' +
        '"## How you compare to your goals" (short), and "## 3 things to try" (specific, actionable, referencing their actual foods). ' +
        'Be encouraging, not judgmental. Do not give medical advice or diagnose; end with a one-line note to consult a professional for medical needs.',
      messages: [{ role: 'user', content: `Here are my goals and recent food logs as JSON:\n${payload}` }],
    });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    res.json({ advice: text });
  } catch (err) {
    console.error('advice error:', err.message);
    res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 500).json({
      error: err.message || 'Could not generate advice.',
    });
  }
});

// Vercel imports the exported app; locally we start a listener ourselves.
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Food Tracker running at http://localhost:${PORT}`);
    if (!process.env.ANTHROPIC_API_KEY) console.warn('Warning: ANTHROPIC_API_KEY is not set.');
    if (!process.env.APP_PASSWORD) console.warn('Warning: APP_PASSWORD is not set; the API is open to anyone who can reach this server.');
  });
}

module.exports = app;
