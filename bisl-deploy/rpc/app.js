'use strict';

const express = require('express');
const crypto = require('crypto');
const { connectContract } = require('./fabricClient');

const port = Number(process.env.PORT || 4000);
const fabricOrg = process.env.FABRIC_ORG || 'org1';
const fabricIdentity = process.env.FABRIC_IDENTITY || 'appUserOrg1';

// Comma-separated API keys. Write keys can call all routes; read keys can only query.
const writeApiKeys = parseKeys(process.env.WRITE_API_KEY || process.env.API_KEY);
const readApiKeys = parseKeys(process.env.READ_API_KEY);
const requireAuth = process.env.REQUIRE_AUTH !== 'false';

const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 120);
const requestCounts = new Map();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

function parseKeys(value) {
    if (!value) return new Set();
    return new Set(
        String(value)
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean)
    );
}

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function keyMatches(provided, allowedSet) {
    for (const key of allowedSet) {
        if (safeEqual(provided, key)) return true;
    }
    return false;
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}

function rateLimit(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    let entry = requestCounts.get(ip);

    if (!entry || now - entry.windowStart > rateLimitWindowMs) {
        entry = { windowStart: now, count: 0 };
        requestCounts.set(ip, entry);
    }

    entry.count += 1;
    if (entry.count > rateLimitMax) {
        return res.status(429).json({
            ok: false,
            error: 'rate_limit_exceeded',
            message: 'Too many requests. Retry later.'
        });
    }

    return next();
}

function extractApiKey(req) {
    const headerKey = req.headers['x-api-key'];
    if (headerKey) return String(headerKey).trim();

    const auth = req.headers.authorization;
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
        return auth.slice(7).trim();
    }
    return '';
}

function requireWriteAuth(req, res, next) {
    if (!requireAuth) return next();

    if (writeApiKeys.size === 0) {
        return res.status(503).json({
            ok: false,
            error: 'auth_not_configured',
            message: 'WRITE_API_KEY (or API_KEY) must be set before accepting write requests.'
        });
    }

    const apiKey = extractApiKey(req);
    if (!apiKey || !keyMatches(apiKey, writeApiKeys)) {
        return res.status(401).json({
            ok: false,
            error: 'unauthorized',
            message: 'Valid write API key required. Pass X-API-Key or Authorization: Bearer <key>.'
        });
    }
    return next();
}

function requireReadAuth(req, res, next) {
    if (!requireAuth) return next();

    const hasAnyKey = writeApiKeys.size > 0 || readApiKeys.size > 0;
    if (!hasAnyKey) {
        return res.status(503).json({
            ok: false,
            error: 'auth_not_configured',
            message: 'API_KEY / WRITE_API_KEY / READ_API_KEY must be set before accepting requests.'
        });
    }

    const apiKey = extractApiKey(req);
    const allowed =
        (apiKey && keyMatches(apiKey, writeApiKeys)) ||
        (apiKey && keyMatches(apiKey, readApiKeys));

    if (!allowed) {
        return res.status(401).json({
            ok: false,
            error: 'unauthorized',
            message: 'Valid API key required. Pass X-API-Key or Authorization: Bearer <key>.'
        });
    }
    return next();
}

async function evaluateQuery({ fcn, args = [] }) {
    const { gateway, contract } = await connectContract({
        org: fabricOrg,
        identity: fabricIdentity
    });
    try {
        const payload = await contract.evaluateTransaction(fcn, ...args.map(String));
        const text = payload.toString();
        try {
            return { ok: true, result: JSON.parse(text) };
        } catch (_e) {
            return { ok: true, result: text };
        }
    } finally {
        gateway.disconnect();
    }
}

async function submitInvoke({ fcn, args = [] }) {
    const { gateway, contract } = await connectContract({
        org: fabricOrg,
        identity: fabricIdentity
    });
    try {
        const payload = await contract.submitTransaction(fcn, ...args.map(String));
        const text = payload.toString();
        try {
            return { ok: true, result: JSON.parse(text) };
        } catch (_e) {
            return { ok: true, result: text || 'submitted' };
        }
    } finally {
        gateway.disconnect();
    }
}

async function handleAnchorProof(req, res) {
    try {
        const proofData = { ...req.body };
        delete proofData.status;

        if (!proofData.id) return res.status(400).json({ ok: false, error: 'id is required' });
        if (!proofData.ipfsHash) {
            return res.status(400).json({ ok: false, error: 'ipfsHash is required' });
        }

        const result = await submitInvoke({
            fcn: 'AnchorDatasetProof',
            args: [JSON.stringify(proofData)]
        });
        res.status(201).json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}

async function handleGetById(req, res) {
    try {
        const result = await evaluateQuery({ fcn: 'GetDataset', args: [req.params.id] });
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}

async function handleListByAgent(req, res) {
    try {
        const result = await evaluateQuery({
            fcn: 'ListDatasetsByAgentId',
            args: [req.params.agentId]
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}

async function handleListByCompany(req, res) {
    try {
        const result = await evaluateQuery({
            fcn: 'ListDatasetsByCompanyId',
            args: [req.params.companyId]
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}

async function handleVerify(req, res) {
    try {
        const { id, candidateHash } = req.body || {};
        if (!id || !candidateHash) {
            return res.status(400).json({
                ok: false,
                error: 'id and candidateHash are required'
            });
        }
        const result = await evaluateQuery({
            fcn: 'VerifyHash',
            args: [id, candidateHash]
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}

async function handleInitRbac(req, res) {
    try {
        const { adminMSP, agentMSP } = req.body || {};
        if (!adminMSP || !agentMSP) {
            return res.status(400).json({
                ok: false,
                error: 'adminMSP and agentMSP are required'
            });
        }

        const result = await submitInvoke({
            fcn: 'InitRBAC',
            args: [adminMSP, agentMSP]
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}

app.use(rateLimit);

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'BISL Proof Transparency RPC',
        version: '1.0.0',
        authRequired: requireAuth,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (_req, res) => {
    res.json({
        ok: true,
        service: 'BISL Proof Transparency RPC',
        endpoints: {
            health: 'GET /health',
            anchor: 'POST /v1/proofs',
            getById: 'GET /v1/proofs/:id',
            listByAgent: 'GET /v1/proofs/agent/:agentId',
            listByCompany: 'GET /v1/proofs/company/:companyId',
            verify: 'POST /v1/proofs/verify',
            initRbac: 'POST /v1/admin/init-rbac'
        }
    });
});

// ---- Secured public RPC (v1) ----
// Register static path segments before :id

app.post('/v1/proofs', requireWriteAuth, handleAnchorProof);
app.post('/v1/proofs/verify', requireReadAuth, handleVerify);
app.get('/v1/proofs/agent/:agentId', requireReadAuth, handleListByAgent);
app.get('/v1/proofs/company/:companyId', requireReadAuth, handleListByCompany);
app.get('/v1/proofs/:id', requireReadAuth, handleGetById);
app.post('/v1/admin/init-rbac', requireWriteAuth, handleInitRbac);

if (requireAuth && writeApiKeys.size === 0 && readApiKeys.size === 0) {
    console.warn(
        '[WARN] Auth is enabled but no API keys are configured. Set WRITE_API_KEY or API_KEY before serving traffic.'
    );
}

app.listen(port, () => {
    console.log(`BISL Proof Transparency RPC listening on http://localhost:${port}`);
    console.log(`Auth required: ${requireAuth}`);
});
