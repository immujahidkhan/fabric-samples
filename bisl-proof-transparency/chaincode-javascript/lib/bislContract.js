'use strict';

const crypto = require('crypto');
const stringify = require('json-stringify-deterministic');
const sortKeysRecursive = require('sort-keys-recursive');
const { Contract } = require('fabric-contract-api');

const configKey = 'CONFIG::RBAC';

const submissionPrefix = 'SUBMISSION';
const stockRequestPrefix = 'STOCK_REQUEST';
const requestEventPrefix = 'REQUEST_EVENT';
const userPrefix = 'USER';
const chatPrefix = 'CHAT';
const auditPrefix = 'AUDIT';

class BISLContract extends Contract {
    async InitRBAC(ctx, adminMSP, agentMSP) {
        if (!adminMSP || !agentMSP) {
            throw new Error('adminMSP and agentMSP are required');
        }
        await ctx.stub.putState(configKey, this._asBuffer({ adminMSP, agentMSP }));
    }

    async SubmitStockData(ctx, id, ticker, companyName, cusip, authorizedShares, issuedOutstandingShares, verifiedFloat, effectiveDate, sourceType, paymentReference) {
        this._require(id && ticker && companyName, 'id, ticker, companyName are required');
        await this._requireAgent(ctx);

        const key = this._ck(ctx, submissionPrefix, id);
        if (await this._existsByKey(ctx, key)) {
            throw new Error(`submission ${id} already exists`);
        }

        const clientID = this._clientID(ctx);
        const msp = ctx.clientIdentity.getMSPID();
        const now = this._ts(ctx);

        const sub = {
            id,
            objectType: submissionPrefix,
            ticker: ticker.toUpperCase(),
            companyName,
            cusip,
            authorizedShares: Number(authorizedShares),
            issuedOutstandingShares: Number(issuedOutstandingShares),
            verifiedFloat: Number(verifiedFloat),
            effectiveDate,
            sourceType,
            submissionTimestamp: now,
            submittedBy: clientID,
            submittedByMSP: msp,
            paymentReference,
            status: 'PENDING',
            reviewNotes: '',
            reviewedBy: '',
            reviewedByMSP: '',
            reviewedAt: '',
            datasetHash: '',
            anchorTxID: '',
            anchorBlockTimestamp: '',
            publicVerificationStatus: 'NOT_PUBLISHED'
        };

        await ctx.stub.putState(key, this._asBuffer(sub));
        await this._appendAudit(ctx, 'SUBMIT', submissionPrefix, id, 'Submission created');
    }

    async ReviewSubmission(ctx, id, approve, reviewNotes) {
        await this._requireAdmin(ctx);
        const sub = await this._readEntity(ctx, submissionPrefix, id, `submission ${id} not found`);
        if (sub.status !== 'PENDING') {
            throw new Error(`submission ${id} already reviewed with status ${sub.status}`);
        }

        const yes = String(approve).toLowerCase() === 'true';
        const now = this._ts(ctx);
        sub.reviewedBy = this._clientID(ctx);
        sub.reviewedByMSP = ctx.clientIdentity.getMSPID();
        sub.reviewedAt = now;
        sub.reviewNotes = reviewNotes || '';

        if (yes) {
            sub.status = 'APPROVED';
            sub.publicVerificationStatus = 'VERIFIED_ON_BLOCKCHAIN';
            sub.anchorTxID = ctx.stub.getTxID();
            sub.anchorBlockTimestamp = now;
            sub.datasetHash = this._submissionHash(sub);
            await this._appendAudit(ctx, 'APPROVE_AND_ANCHOR', submissionPrefix, id, 'Submission approved and hash anchored');
        } else {
            sub.status = 'REJECTED';
            sub.publicVerificationStatus = 'REJECTED';
            await this._appendAudit(ctx, 'REJECT', submissionPrefix, id, sub.reviewNotes);
        }

        await ctx.stub.putState(this._ck(ctx, submissionPrefix, id), this._asBuffer(sub));
    }

    async ReadSubmission(ctx, id) {
        const sub = await this._readEntity(ctx, submissionPrefix, id, `submission ${id} not found`);
        return JSON.stringify(sub);
    }

    async ListSubmissions(ctx) {
        return JSON.stringify(await this._listByType(ctx, submissionPrefix));
    }

    async ListPublishedByTicker(ctx, ticker) {
        const rows = await this._listByType(ctx, submissionPrefix);
        const result = rows.filter((x) => x.ticker === String(ticker).toUpperCase() && x.status === 'APPROVED');
        return JSON.stringify(result);
    }

    async CreateStockRequest(ctx, requestID, ticker, stockName, requestedByUserID, comment) {
        this._require(requestID && ticker && requestedByUserID, 'requestID, ticker, requestedByUserID are required');

        const now = this._ts(ctx);
        const key = this._ck(ctx, stockRequestPrefix, requestID);
        let req = null;

        const existing = await ctx.stub.getState(key);
        if (existing && existing.length > 0) {
            req = JSON.parse(existing.toString());
            req.requestCount += 1;
            req.lastRequestedAt = now;
            if (!req.uniqueRequestors.includes(requestedByUserID)) {
                req.uniqueRequestors.push(requestedByUserID);
            }
        } else {
            req = {
                id: requestID,
                objectType: stockRequestPrefix,
                ticker: ticker.toUpperCase(),
                stockName,
                requestCount: 1,
                firstRequestedAt: now,
                lastRequestedAt: now,
                status: 'PENDING',
                uniqueRequestors: [requestedByUserID],
                mostRecentComment: ''
            };
        }

        req.mostRecentComment = comment || '';
        await ctx.stub.putState(key, this._asBuffer(req));

        const eventID = `${requestID}::${ctx.stub.getTxID()}`;
        await ctx.stub.putState(
            this._ck(ctx, requestEventPrefix, eventID),
            this._asBuffer({
                id: eventID,
                objectType: requestEventPrefix,
                requestID,
                ticker: ticker.toUpperCase(),
                requestedBy: requestedByUserID,
                timestamp: now
            })
        );

        await this._appendAudit(ctx, 'REQUEST_STOCK', stockRequestPrefix, requestID, 'Stock request event captured');
    }

    async UpdateStockRequestStatus(ctx, requestID, status) {
        await this._requireAdmin(ctx);
        const s = String(status).toUpperCase();
        if (!['PENDING', 'REVIEWED', 'ACTIONED'].includes(s)) {
            throw new Error('status must be PENDING, REVIEWED, or ACTIONED');
        }
        const req = await this._readEntity(ctx, stockRequestPrefix, requestID, `stock request ${requestID} not found`);
        req.status = s;
        await ctx.stub.putState(this._ck(ctx, stockRequestPrefix, requestID), this._asBuffer(req));
        await this._appendAudit(ctx, 'REQUEST_STATUS_UPDATE', stockRequestPrefix, requestID, s);
    }

    async ListStockRequests(ctx) {
        return JSON.stringify(await this._listByType(ctx, stockRequestPrefix));
    }

    async ListStockRequestEvents(ctx, requestID) {
        const rows = await this._listByType(ctx, requestEventPrefix);
        return JSON.stringify(rows.filter((x) => x.requestID === requestID));
    }

    async UpsertUserProfile(ctx, userID, email, oauthProvider, verificationTier, verificationStatus, subscriptionPlan, subscriptionStatus, subscriptionExpiresAt) {
        await this._requireAdmin(ctx);
        this._require(userID && email, 'userID and email are required');

        const key = this._ck(ctx, userPrefix, userID);
        const now = this._ts(ctx);
        let createdAt = now;

        const existing = await ctx.stub.getState(key);
        if (existing && existing.length > 0) {
            createdAt = JSON.parse(existing.toString()).createdAt;
        }

        const profile = {
            id: userID,
            objectType: userPrefix,
            email,
            oauthProvider,
            verificationTier,
            verificationStatus,
            subscriptionPlan,
            subscriptionStatus,
            subscriptionExpiresAt,
            createdAt
        };

        await ctx.stub.putState(key, this._asBuffer(profile));
        await this._appendAudit(ctx, 'UPSERT_USER', userPrefix, userID, 'User profile upserted');
    }

    async ReadUserProfile(ctx, userID) {
        const profile = await this._readEntity(ctx, userPrefix, userID, `user profile ${userID} not found`);
        return JSON.stringify(profile);
    }

    async PostChatMessage(ctx, messageID, ticker, authorUserID, body, parentID) {
        this._require(messageID && ticker && authorUserID && body, 'messageID, ticker, authorUserID, body are required');

        const key = this._ck(ctx, chatPrefix, messageID);
        if (await this._existsByKey(ctx, key)) {
            throw new Error(`message ${messageID} already exists`);
        }

        const profile = await this._readEntity(ctx, userPrefix, authorUserID, `user profile ${authorUserID} not found`);
        if (String(profile.verificationStatus).toUpperCase() !== 'VERIFIED') {
            throw new Error(`user ${authorUserID} is not verified`);
        }
        if (String(profile.subscriptionStatus).toUpperCase() !== 'ACTIVE') {
            throw new Error(`user ${authorUserID} does not have an active subscription`);
        }

        const msg = {
            id: messageID,
            objectType: chatPrefix,
            ticker: String(ticker).toUpperCase(),
            authorUserID,
            body,
            parentID: parentID || '',
            createdAt: this._ts(ctx),
            isFlagged: false,
            flagReason: '',
            isDeleted: false,
            pinned: false
        };

        await ctx.stub.putState(key, this._asBuffer(msg));
        await this._appendAudit(ctx, 'POST_MESSAGE', chatPrefix, messageID, 'Chat message posted');
    }

    async FlagChatMessage(ctx, messageID, reason) {
        const msg = await this._readEntity(ctx, chatPrefix, messageID, `message ${messageID} not found`);
        msg.isFlagged = true;
        msg.flagReason = reason || '';
        await ctx.stub.putState(this._ck(ctx, chatPrefix, messageID), this._asBuffer(msg));
        await this._appendAudit(ctx, 'FLAG_MESSAGE', chatPrefix, messageID, msg.flagReason);
    }

    async ModerateChatMessage(ctx, messageID, action) {
        await this._requireAdmin(ctx);
        const a = String(action).toUpperCase();
        if (!['DELETE', 'PIN', 'UNPIN'].includes(a)) {
            throw new Error('action must be DELETE, PIN, or UNPIN');
        }

        const msg = await this._readEntity(ctx, chatPrefix, messageID, `message ${messageID} not found`);
        if (a === 'DELETE') msg.isDeleted = true;
        if (a === 'PIN') msg.pinned = true;
        if (a === 'UNPIN') msg.pinned = false;

        await ctx.stub.putState(this._ck(ctx, chatPrefix, messageID), this._asBuffer(msg));
        await this._appendAudit(ctx, 'MODERATE_MESSAGE', chatPrefix, messageID, a);
    }

    async ListChatMessagesByTicker(ctx, ticker) {
        const t = String(ticker).toUpperCase();
        const rows = await this._listByType(ctx, chatPrefix);
        return JSON.stringify(rows.filter((x) => x.ticker === t && !x.isDeleted));
    }

    async ListAuditLogs(ctx) {
        return JSON.stringify(await this._listByType(ctx, auditPrefix));
    }

    async GetHealth() {
        return 'BISL JS Fabric contract is alive';
    }

    _asBuffer(obj) {
        return Buffer.from(stringify(sortKeysRecursive(obj)));
    }

    _submissionHash(sub) {
        const canonical = [
            sub.ticker,
            sub.companyName,
            sub.cusip,
            sub.authorizedShares,
            sub.issuedOutstandingShares,
            sub.verifiedFloat,
            sub.effectiveDate,
            sub.submissionTimestamp
        ].join('|');
        return crypto.createHash('sha256').update(canonical).digest('hex');
    }

    _ck(ctx, objectType, id) {
        return ctx.stub.createCompositeKey(objectType, [id]);
    }

    async _existsByKey(ctx, key) {
        const b = await ctx.stub.getState(key);
        return !!(b && b.length > 0);
    }

    async _readEntity(ctx, objectType, id, errorMessage) {
        const b = await ctx.stub.getState(this._ck(ctx, objectType, id));
        if (!b || b.length === 0) throw new Error(errorMessage);
        return JSON.parse(b.toString());
    }

    async _listByType(ctx, objectType) {
        const iter = await ctx.stub.getStateByPartialCompositeKey(objectType, []);
        const out = [];
        let item = await iter.next();
        while (!item.done) {
            out.push(JSON.parse(Buffer.from(item.value.value).toString('utf8')));
            item = await iter.next();
        }
        await iter.close();
        return out;
    }

    async _requireAdmin(ctx) {
        const cfg = await this._getRBAC(ctx);
        const msp = ctx.clientIdentity.getMSPID();
        if (msp !== cfg.adminMSP) {
            throw new Error(`access denied: admin MSP required (${cfg.adminMSP}), got ${msp}`);
        }
    }

    async _requireAgent(ctx) {
        const cfg = await this._getRBAC(ctx);
        const msp = ctx.clientIdentity.getMSPID();
        if (msp !== cfg.agentMSP) {
            throw new Error(`access denied: agent MSP required (${cfg.agentMSP}), got ${msp}`);
        }
    }

    async _getRBAC(ctx) {
        const b = await ctx.stub.getState(configKey);
        if (!b || b.length === 0) {
            throw new Error('RBAC is not initialized; call InitRBAC first');
        }
        return JSON.parse(b.toString());
    }

    async _appendAudit(ctx, action, entity, entityID, details) {
        const txID = ctx.stub.getTxID();
        const id = `${txID}::${entityID}`;
        const item = {
            id,
            objectType: auditPrefix,
            action,
            entity,
            entityID,
            actorID: this._clientID(ctx),
            actorMSP: ctx.clientIdentity.getMSPID(),
            timestamp: this._ts(ctx),
            details: details || ''
        };
        await ctx.stub.putState(this._ck(ctx, auditPrefix, id), this._asBuffer(item));
    }

    _clientID(ctx) {
        try {
            return ctx.clientIdentity.getID();
        } catch (_e) {
            return 'unknown';
        }
    }

    _ts(ctx) {
        const ts = ctx.stub.getTxTimestamp();
        if (!ts || !ts.seconds) return new Date().toISOString();
        const millis = Number(ts.seconds.low) * 1000 + Math.floor(Number(ts.nanos) / 1e6);
        return new Date(millis).toISOString();
    }

    _require(condition, message) {
        if (!condition) throw new Error(message);
    }
}

module.exports = BISLContract;
