'use strict';

const express = require('express');
const { connectContract } = require('./fabricClient');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'BISL-rest-api', timestamp: new Date().toISOString() });
});
app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'BISL-rest-api', timestamp: new Date().toISOString() });
});

app.post('/query', async (req, res) => {
    try {
        const { fcn, args = [], org = 'org1', identity = 'appUserOrg1' } = req.body;
        if (!fcn) return res.status(400).json({ error: 'fcn is required' });

        const { gateway, contract } = await connectContract({ org, identity });
        try {
            const payload = await contract.evaluateTransaction(fcn, ...args.map(String));
            const text = payload.toString();
            try {
                return res.json({ ok: true, result: JSON.parse(text) });
            } catch (_e) {
                return res.json({ ok: true, result: text });
            }
        } finally {
            gateway.disconnect();
        }
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/invoke', async (req, res) => {
    try {
        const { fcn, args = [], org = 'org1', identity = 'appUserOrg1' } = req.body;
        if (!fcn) return res.status(400).json({ error: 'fcn is required' });

        const { gateway, contract } = await connectContract({ org, identity });
        try {
            const payload = await contract.submitTransaction(fcn, ...args.map(String));
            const text = payload.toString();
            try {
                return res.json({ ok: true, result: JSON.parse(text) });
            } catch (_e) {
                return res.json({ ok: true, result: text || 'submitted' });
            }
        } finally {
            gateway.disconnect();
        }
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
    console.log(`BISL REST API listening on http://localhost:${port}`);
});
