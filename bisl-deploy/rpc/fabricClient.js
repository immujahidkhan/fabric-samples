'use strict';

const path = require('path');
const fs = require('fs');
const { Gateway, Wallets } = require('fabric-network');

// Dev default: fabric-samples root. VPS package: set FABRIC_ROOT=../fabric
const fabricRoot = process.env.FABRIC_ROOT
    ? path.resolve(process.env.FABRIC_ROOT)
    : path.resolve(__dirname, '..', '..');

function connectionProfileForOrg(org) {
    if (org === 'org2') {
        return path.join(
            fabricRoot,
            'test-network',
            'organizations',
            'peerOrganizations',
            'org2.example.com',
            'connection-org2.json'
        );
    }
    return path.join(
        fabricRoot,
        'test-network',
        'organizations',
        'peerOrganizations',
        'org1.example.com',
        'connection-org1.json'
    );
}

async function connectContract({ org, identity }) {
    const walletPath = process.env.WALLET_PATH || path.join(__dirname, 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const exists = await wallet.get(identity);
    if (!exists) {
        throw new Error(`Identity ${identity} not found in wallet: ${walletPath}. Run: npm run setup:wallet`);
    }

    const ccpPath = process.env.CONNECTION_PROFILE || connectionProfileForOrg(org);
    if (!fs.existsSync(ccpPath)) {
        throw new Error(`Connection profile not found: ${ccpPath}`);
    }

    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
    const asLocalhost = process.env.DISCOVERY_AS_LOCALHOST !== 'false';

    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity,
        discovery: { enabled: true, asLocalhost }
    });

    const channelName = process.env.CHANNEL_NAME || 'mychannel';
    const chaincodeName = process.env.CHAINCODE_NAME || 'bislcc';

    const network = await gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);

    return { gateway, contract };
}

module.exports = { connectContract };
