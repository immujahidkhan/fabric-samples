package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
	"github.com/hyperledger/fabric-samples/bisl-proof-transparency/chaincode-go/chaincode"
)

func main() {
	cc, err := contractapi.NewChaincode(&chaincode.SmartContract{})
	if err != nil {
		log.Panicf("failed to create BISL chaincode: %v", err)
	}

	if err := cc.Start(); err != nil {
		log.Panicf("failed to start BISL chaincode: %v", err)
	}
}
