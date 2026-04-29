'use strict';

const stringify = require('json-stringify-deterministic');
const sortKeysRecursive = require('sort-keys-recursive');
const { Contract } = require('fabric-contract-api');

const configKey = 'CONFIG::RBAC';
const datasetPrefix = 'DATASET';

class BISLContract extends Contract {
    async InitRBAC(ctx, adminMSP, agentMSP) {
        if (!adminMSP || !agentMSP) {
            throw new Error('adminMSP and agentMSP are required');
        }

        const cfg = { adminMSP, agentMSP };
        await ctx.stub.putState(configKey, this._asBuffer(cfg));
    }

    // Admin anchors proof after off-chain validation is complete.
    async AnchorDataset(ctx, submissionID, datasetHash, ticker, anchoredAt) {
        await this._requireAdmin(ctx);

        if (!submissionID || !datasetHash || !ticker || !anchoredAt) {
            throw new Error('submissionID, datasetHash, ticker, anchoredAt are required');
        }

        const key = this._ck(ctx, datasetPrefix, submissionID);
        const existing = await ctx.stub.getState(key);
        if (existing && existing.length > 0) {
            throw new Error(`dataset ${submissionID} already anchored`);
        }

        const record = {
            id: submissionID,
            objectType: datasetPrefix,
            ticker: String(ticker).toUpperCase(),
            datasetHash,
            anchoredAt,
            anchorTxID: ctx.stub.getTxID(),
            anchoredByMSP: ctx.clientIdentity.getMSPID(),
            anchoredByID: this._clientID(ctx),
            ledgerTimestamp: this._txTimestamp(ctx)
        };

        await ctx.stub.putState(key, this._asBuffer(record));
        return JSON.stringify(record);
    }

    async GetDataset(ctx, submissionID) {
        const key = this._ck(ctx, datasetPrefix, submissionID);
        const b = await ctx.stub.getState(key);
        if (!b || b.length === 0) {
            throw new Error(`dataset ${submissionID} not found`);
        }
        return b.toString();
    }

    async VerifyHash(ctx, submissionID, candidateHash) {
        if (!submissionID || !candidateHash) {
            throw new Error('submissionID and candidateHash are required');
        }

        const key = this._ck(ctx, datasetPrefix, submissionID);
        const b = await ctx.stub.getState(key);
        if (!b || b.length === 0) {
            throw new Error(`dataset ${submissionID} not found`);
        }

        const rec = JSON.parse(b.toString());
        const match = rec.datasetHash === candidateHash;

        return JSON.stringify({
            submissionID,
            ticker: rec.ticker,
            anchoredHash: rec.datasetHash,
            candidateHash,
            match,
            anchorTxID: rec.anchorTxID,
            anchoredAt: rec.anchoredAt
        });
    }

    async ListDatasetsByTicker(ctx, ticker) {
        if (!ticker) {
            throw new Error('ticker is required');
        }

        const needle = String(ticker).toUpperCase();
        const iter = await ctx.stub.getStateByPartialCompositeKey(datasetPrefix, []);
        const rows = [];

        let item = await iter.next();
        while (!item.done) {
            const rec = JSON.parse(Buffer.from(item.value.value).toString('utf8'));
            if (rec.ticker === needle) {
                rows.push(rec);
            }
            item = await iter.next();
        }

        await iter.close();
        return JSON.stringify(rows);
    }

    async GetHealth() {
        return 'BISL minimal notarization chaincode is alive';
    }

    async _requireAdmin(ctx) {
        const cfg = await this._getRBAC(ctx);
        const msp = ctx.clientIdentity.getMSPID();
        if (msp !== cfg.adminMSP) {
            throw new Error(`access denied: admin MSP required (${cfg.adminMSP}), got ${msp}`);
        }
    }

    async _getRBAC(ctx) {
        const b = await ctx.stub.getState(configKey);
        if (!b || b.length === 0) {
            throw new Error('RBAC is not initialized; call InitRBAC first');
        }
        return JSON.parse(b.toString());
    }

    _ck(ctx, objectType, id) {
        return ctx.stub.createCompositeKey(objectType, [id]);
    }

    _asBuffer(obj) {
        return Buffer.from(stringify(sortKeysRecursive(obj)));
    }

    _clientID(ctx) {
        try {
            return ctx.clientIdentity.getID();
        } catch (_e) {
            return 'unknown';
        }
    }

    _txTimestamp(ctx) {
        const ts = ctx.stub.getTxTimestamp();
        if (!ts || !ts.seconds) return new Date().toISOString();
        const millis = Number(ts.seconds.low) * 1000 + Math.floor(Number(ts.nanos) / 1e6);
        return new Date(millis).toISOString();
    }
}

module.exports = BISLContract;
