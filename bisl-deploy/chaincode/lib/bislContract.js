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

    // Admin anchors immutable proof record from backend payload (JSON string).
    async AnchorDatasetProof(ctx, datasetJSON) {
        await this._requireAdmin(ctx);

        if (!datasetJSON) {
            throw new Error('datasetJSON is required');
        }

        let data;
        try {
            data = JSON.parse(datasetJSON);
        } catch (_e) {
            throw new Error('datasetJSON must be valid JSON');
        }

        delete data.status;

        if (!data.id) {
            throw new Error('id is required');
        }
        if (!data.ipfsHash) {
            throw new Error('ipfsHash is required');
        }

        const key = this._ck(ctx, datasetPrefix, data.id);
        const existing = await ctx.stub.getState(key);
        if (existing && existing.length > 0) {
            throw new Error(`dataset ${data.id} already anchored`);
        }

        const record = {
            ...data,
            objectType: datasetPrefix,
            anchorTxID: ctx.stub.getTxID(),
            anchoredByMSP: ctx.clientIdentity.getMSPID(),
            anchoredByID: this._clientID(ctx),
            ledgerTimestamp: this._txTimestamp(ctx)
        };

        await ctx.stub.putState(key, this._asBuffer(record));
        return JSON.stringify(record);
    }

    async GetDataset(ctx, id) {
        if (!id) {
            throw new Error('id is required');
        }

        const key = this._ck(ctx, datasetPrefix, id);
        const b = await ctx.stub.getState(key);
        if (!b || b.length === 0) {
            throw new Error(`dataset ${id} not found`);
        }
        return b.toString();
    }

    async VerifyHash(ctx, id, candidateHash) {
        if (!id || !candidateHash) {
            throw new Error('id and candidateHash are required');
        }

        const key = this._ck(ctx, datasetPrefix, id);
        const b = await ctx.stub.getState(key);
        if (!b || b.length === 0) {
            throw new Error(`dataset ${id} not found`);
        }

        const rec = JSON.parse(b.toString());
        const anchoredHash = rec.ipfsHash;
        const match = anchoredHash === candidateHash;

        return JSON.stringify({
            id,
            agentId: rec.agentId,
            companyId: rec.companyId,
            anchoredHash,
            candidateHash,
            match,
            anchorTxID: rec.anchorTxID,
            submittedAt: rec.submittedAt
        });
    }

    async ListDatasetsByAgentId(ctx, agentId) {
        if (!agentId) {
            throw new Error('agentId is required');
        }
        return this._listDatasetsByField(ctx, 'agentId', agentId);
    }

    async ListDatasetsByCompanyId(ctx, companyId) {
        if (!companyId) {
            throw new Error('companyId is required');
        }
        return this._listDatasetsByField(ctx, 'companyId', companyId);
    }

    async GetHealth() {
        return 'BISL minimal notarization chaincode is alive';
    }

    async _listDatasetsByField(ctx, field, value) {
        const iter = await ctx.stub.getStateByPartialCompositeKey(datasetPrefix, []);
        const rows = [];

        let item = await iter.next();
        while (!item.done) {
            const rec = JSON.parse(Buffer.from(item.value.value).toString('utf8'));
            if (rec[field] === value) {
                rows.push(rec);
            }
            item = await iter.next();
        }

        await iter.close();
        return JSON.stringify(rows);
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
