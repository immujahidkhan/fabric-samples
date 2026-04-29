'use strict';

const path = require('path');
const fs = require('fs');
const { Wallets } = require('fabric-network');

const repoRoot = path.resolve(__dirname, '..', '..');

function firstFile(dir) {
    return fs.readdirSync(dir)[0];
}

async function putIdentity(wallet, label, mspId, certPath, keyDir) {
    const keyPath = path.join(keyDir, firstFile(keyDir));
    const cert = fs.readFileSync(certPath, 'utf8');
    const key = fs.readFileSync(keyPath, 'utf8');

    await wallet.put(label, {
        credentials: { certificate: cert, privateKey: key },
        mspId,
        type: 'X.509'
    });

    console.log(`Imported ${label}`);
}

async function main() {
    const walletPath = process.env.WALLET_PATH || path.join(__dirname, 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    await putIdentity(
        wallet,
        'appUserOrg1',
        'Org1MSP',
        path.join(repoRoot, 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'users', 'Admin@org1.example.com', 'msp', 'signcerts', 'cert.pem'),
        path.join(repoRoot, 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'users', 'Admin@org1.example.com', 'msp', 'keystore')
    );

    await putIdentity(
        wallet,
        'appUserOrg2',
        'Org2MSP',
        path.join(repoRoot, 'test-network', 'organizations', 'peerOrganizations', 'org2.example.com', 'users', 'Admin@org2.example.com', 'msp', 'signcerts', 'cert.pem'),
        path.join(repoRoot, 'test-network', 'organizations', 'peerOrganizations', 'org2.example.com', 'users', 'Admin@org2.example.com', 'msp', 'keystore')
    );

    console.log(`Wallet ready at ${walletPath}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
