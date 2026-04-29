package chaincode

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

const (
	configKey = "CONFIG::RBAC"

	submissionPrefix   = "SUBMISSION"
	stockRequestPrefix = "STOCK_REQUEST"
	requestEventPrefix = "REQUEST_EVENT"
	userPrefix         = "USER"
	chatPrefix         = "CHAT"
	auditPrefix        = "AUDIT"
)

type SmartContract struct {
	contractapi.Contract
}

type RBACConfig struct {
	AdminMSP string `json:"adminMSP"`
	AgentMSP string `json:"agentMSP"`
}

type StockSubmission struct {
	ID                       string `json:"id"`
	ObjectType               string `json:"objectType"`
	Ticker                   string `json:"ticker"`
	CompanyName              string `json:"companyName"`
	CUSIP                    string `json:"cusip"`
	AuthorizedShares         uint64 `json:"authorizedShares"`
	IssuedOutstandingShares  uint64 `json:"issuedOutstandingShares"`
	VerifiedFloat            uint64 `json:"verifiedFloat"`
	EffectiveDate            string `json:"effectiveDate"`
	SourceType               string `json:"sourceType"`
	SubmissionTimestamp      string `json:"submissionTimestamp"`
	SubmittedBy              string `json:"submittedBy"`
	SubmittedByMSP           string `json:"submittedByMSP"`
	PaymentReference         string `json:"paymentReference"`
	Status                   string `json:"status"`
	ReviewNotes              string `json:"reviewNotes"`
	ReviewedBy               string `json:"reviewedBy"`
	ReviewedByMSP            string `json:"reviewedByMSP"`
	ReviewedAt               string `json:"reviewedAt"`
	DatasetHash              string `json:"datasetHash"`
	AnchorTxID               string `json:"anchorTxID"`
	AnchorBlockTimestamp     string `json:"anchorBlockTimestamp"`
	PublicVerificationStatus string `json:"publicVerificationStatus"`
}

type StockRequest struct {
	ID                string   `json:"id"`
	ObjectType        string   `json:"objectType"`
	Ticker            string   `json:"ticker"`
	StockName         string   `json:"stockName"`
	RequestCount      uint64   `json:"requestCount"`
	FirstRequestedAt  string   `json:"firstRequestedAt"`
	LastRequestedAt   string   `json:"lastRequestedAt"`
	Status            string   `json:"status"`
	UniqueRequestors  []string `json:"uniqueRequestors"`
	MostRecentComment string   `json:"mostRecentComment"`
}

type StockRequestEvent struct {
	ID          string `json:"id"`
	ObjectType  string `json:"objectType"`
	RequestID   string `json:"requestId"`
	Ticker      string `json:"ticker"`
	RequestedBy string `json:"requestedBy"`
	Timestamp   string `json:"timestamp"`
}

type UserProfile struct {
	ID                    string `json:"id"`
	ObjectType            string `json:"objectType"`
	Email                 string `json:"email"`
	OAuthProvider         string `json:"oauthProvider"`
	VerificationTier      string `json:"verificationTier"`
	VerificationStatus    string `json:"verificationStatus"`
	SubscriptionPlan      string `json:"subscriptionPlan"`
	SubscriptionStatus    string `json:"subscriptionStatus"`
	SubscriptionExpiresAt string `json:"subscriptionExpiresAt"`
	CreatedAt             string `json:"createdAt"`
}

type ChatMessage struct {
	ID           string `json:"id"`
	ObjectType   string `json:"objectType"`
	Ticker       string `json:"ticker"`
	AuthorUserID string `json:"authorUserId"`
	Body         string `json:"body"`
	ParentID     string `json:"parentId"`
	CreatedAt    string `json:"createdAt"`
	IsFlagged    bool   `json:"isFlagged"`
	FlagReason   string `json:"flagReason"`
	IsDeleted    bool   `json:"isDeleted"`
	Pinned       bool   `json:"pinned"`
}

type AuditLog struct {
	ID         string `json:"id"`
	ObjectType string `json:"objectType"`
	Action     string `json:"action"`
	Entity     string `json:"entity"`
	EntityID   string `json:"entityId"`
	ActorID    string `json:"actorId"`
	ActorMSP   string `json:"actorMSP"`
	Timestamp  string `json:"timestamp"`
	Details    string `json:"details"`
}

func (s *SmartContract) InitRBAC(ctx contractapi.TransactionContextInterface, adminMSP string, agentMSP string) error {
	if adminMSP == "" || agentMSP == "" {
		return fmt.Errorf("adminMSP and agentMSP are required")
	}
	cfg := RBACConfig{AdminMSP: adminMSP, AgentMSP: agentMSP}
	b, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(configKey, b)
}

func (s *SmartContract) SubmitStockData(ctx contractapi.TransactionContextInterface, id string, ticker string, companyName string, cusip string, authorizedShares uint64, issuedOutstandingShares uint64, verifiedFloat uint64, effectiveDate string, sourceType string, paymentReference string) error {
	if id == "" || ticker == "" || companyName == "" {
		return fmt.Errorf("id, ticker, companyName are required")
	}
	if err := s.requireAgent(ctx); err != nil {
		return err
	}
	if exists, _ := s.keyExists(ctx, submissionPrefix, id); exists {
		return fmt.Errorf("submission %s already exists", id)
	}

	clientID, _ := ctx.GetClientIdentity().GetID()
	msp, _ := ctx.GetClientIdentity().GetMSPID()
	ts := txTimestampRFC3339(ctx)

	sub := StockSubmission{
		ID:                       id,
		ObjectType:               submissionPrefix,
		Ticker:                   strings.ToUpper(ticker),
		CompanyName:              companyName,
		CUSIP:                    cusip,
		AuthorizedShares:         authorizedShares,
		IssuedOutstandingShares:  issuedOutstandingShares,
		VerifiedFloat:            verifiedFloat,
		EffectiveDate:            effectiveDate,
		SourceType:               sourceType,
		SubmissionTimestamp:      ts,
		SubmittedBy:              clientID,
		SubmittedByMSP:           msp,
		PaymentReference:         paymentReference,
		Status:                   "PENDING",
		PublicVerificationStatus: "NOT_PUBLISHED",
	}

	if err := s.putWithCompositeKey(ctx, submissionPrefix, id, sub); err != nil {
		return err
	}
	return s.appendAudit(ctx, "SUBMIT", submissionPrefix, id, "Submission created")
}

func (s *SmartContract) ReviewSubmission(ctx contractapi.TransactionContextInterface, id string, approve bool, reviewNotes string) error {
	if err := s.requireAdmin(ctx); err != nil {
		return err
	}
	sub, err := s.ReadSubmission(ctx, id)
	if err != nil {
		return err
	}
	if sub.Status != "PENDING" {
		return fmt.Errorf("submission %s is already reviewed with status %s", id, sub.Status)
	}

	clientID, _ := ctx.GetClientIdentity().GetID()
	msp, _ := ctx.GetClientIdentity().GetMSPID()
	now := txTimestampRFC3339(ctx)

	sub.ReviewedBy = clientID
	sub.ReviewedByMSP = msp
	sub.ReviewedAt = now
	sub.ReviewNotes = reviewNotes

	if approve {
		sub.Status = "APPROVED"
		sub.PublicVerificationStatus = "VERIFIED_ON_BLOCKCHAIN"
		sub.AnchorTxID = ctx.GetStub().GetTxID()
		sub.AnchorBlockTimestamp = now
		sub.DatasetHash = s.calculateSubmissionHash(sub)
		if err := s.appendAudit(ctx, "APPROVE_AND_ANCHOR", submissionPrefix, id, "Submission approved and hash anchored"); err != nil {
			return err
		}
	} else {
		sub.Status = "REJECTED"
		sub.PublicVerificationStatus = "REJECTED"
		if err := s.appendAudit(ctx, "REJECT", submissionPrefix, id, reviewNotes); err != nil {
			return err
		}
	}

	return s.putWithCompositeKey(ctx, submissionPrefix, id, sub)
}

func (s *SmartContract) ReadSubmission(ctx contractapi.TransactionContextInterface, id string) (*StockSubmission, error) {
	b, err := s.getByCompositeKey(ctx, submissionPrefix, id)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, fmt.Errorf("submission %s not found", id)
	}
	var sub StockSubmission
	if err := json.Unmarshal(b, &sub); err != nil {
		return nil, err
	}
	return &sub, nil
}

func (s *SmartContract) ListSubmissions(ctx contractapi.TransactionContextInterface) ([]*StockSubmission, error) {
	entries, err := s.listByType(ctx, submissionPrefix)
	if err != nil {
		return nil, err
	}
	out := make([]*StockSubmission, 0, len(entries))
	for _, b := range entries {
		var item StockSubmission
		if err := json.Unmarshal(b, &item); err != nil {
			return nil, err
		}
		out = append(out, &item)
	}
	return out, nil
}

func (s *SmartContract) ListPublishedByTicker(ctx contractapi.TransactionContextInterface, ticker string) ([]*StockSubmission, error) {
	all, err := s.ListSubmissions(ctx)
	if err != nil {
		return nil, err
	}
	needle := strings.ToUpper(ticker)
	out := make([]*StockSubmission, 0)
	for _, sub := range all {
		if sub.Ticker == needle && sub.Status == "APPROVED" {
			out = append(out, sub)
		}
	}
	return out, nil
}

func (s *SmartContract) CreateStockRequest(ctx contractapi.TransactionContextInterface, requestID string, ticker string, stockName string, requestedByUserID string, comment string) error {
	if requestID == "" || ticker == "" || requestedByUserID == "" {
		return fmt.Errorf("requestID, ticker, requestedByUserID are required")
	}
	now := txTimestampRFC3339(ctx)
	ticker = strings.ToUpper(ticker)

	var req StockRequest
	found := false
	b, err := s.getByCompositeKey(ctx, stockRequestPrefix, requestID)
	if err != nil {
		return err
	}
	if b != nil {
		if err := json.Unmarshal(b, &req); err != nil {
			return err
		}
		found = true
	}

	if !found {
		req = StockRequest{
			ID:               requestID,
			ObjectType:       stockRequestPrefix,
			Ticker:           ticker,
			StockName:        stockName,
			RequestCount:     1,
			FirstRequestedAt: now,
			LastRequestedAt:  now,
			Status:           "PENDING",
			UniqueRequestors: []string{requestedByUserID},
		}
	} else {
		req.RequestCount++
		req.LastRequestedAt = now
		req.UniqueRequestors = appendIfMissing(req.UniqueRequestors, requestedByUserID)
	}
	req.MostRecentComment = comment

	if err := s.putWithCompositeKey(ctx, stockRequestPrefix, requestID, req); err != nil {
		return err
	}
	event := StockRequestEvent{
		ID:          fmt.Sprintf("%s::%s", requestID, ctx.GetStub().GetTxID()),
		ObjectType:  requestEventPrefix,
		RequestID:   requestID,
		Ticker:      ticker,
		RequestedBy: requestedByUserID,
		Timestamp:   now,
	}
	if err := s.putWithCompositeKey(ctx, requestEventPrefix, event.ID, event); err != nil {
		return err
	}
	return s.appendAudit(ctx, "REQUEST_STOCK", stockRequestPrefix, requestID, "Stock request event captured")
}

func (s *SmartContract) UpdateStockRequestStatus(ctx contractapi.TransactionContextInterface, requestID string, status string) error {
	if err := s.requireAdmin(ctx); err != nil {
		return err
	}
	status = strings.ToUpper(status)
	if status != "PENDING" && status != "REVIEWED" && status != "ACTIONED" {
		return fmt.Errorf("status must be PENDING, REVIEWED, or ACTIONED")
	}

	b, err := s.getByCompositeKey(ctx, stockRequestPrefix, requestID)
	if err != nil {
		return err
	}
	if b == nil {
		return fmt.Errorf("stock request %s not found", requestID)
	}

	var req StockRequest
	if err := json.Unmarshal(b, &req); err != nil {
		return err
	}
	req.Status = status
	if err := s.putWithCompositeKey(ctx, stockRequestPrefix, requestID, req); err != nil {
		return err
	}
	return s.appendAudit(ctx, "REQUEST_STATUS_UPDATE", stockRequestPrefix, requestID, status)
}

func (s *SmartContract) ListStockRequests(ctx contractapi.TransactionContextInterface) ([]*StockRequest, error) {
	entries, err := s.listByType(ctx, stockRequestPrefix)
	if err != nil {
		return nil, err
	}
	out := make([]*StockRequest, 0, len(entries))
	for _, b := range entries {
		var item StockRequest
		if err := json.Unmarshal(b, &item); err != nil {
			return nil, err
		}
		out = append(out, &item)
	}
	return out, nil
}

func (s *SmartContract) ListStockRequestEvents(ctx contractapi.TransactionContextInterface, requestID string) ([]*StockRequestEvent, error) {
	entries, err := s.listByType(ctx, requestEventPrefix)
	if err != nil {
		return nil, err
	}
	out := make([]*StockRequestEvent, 0)
	for _, b := range entries {
		var item StockRequestEvent
		if err := json.Unmarshal(b, &item); err != nil {
			return nil, err
		}
		if item.RequestID == requestID {
			out = append(out, &item)
		}
	}
	return out, nil
}

func (s *SmartContract) UpsertUserProfile(ctx contractapi.TransactionContextInterface, userID string, email string, oauthProvider string, verificationTier string, verificationStatus string, subscriptionPlan string, subscriptionStatus string, subscriptionExpiresAt string) error {
	if err := s.requireAdmin(ctx); err != nil {
		return err
	}
	if userID == "" || email == "" {
		return fmt.Errorf("userID and email are required")
	}
	b, err := s.getByCompositeKey(ctx, userPrefix, userID)
	if err != nil {
		return err
	}

	now := txTimestampRFC3339(ctx)
	profile := UserProfile{
		ID:                    userID,
		ObjectType:            userPrefix,
		Email:                 email,
		OAuthProvider:         oauthProvider,
		VerificationTier:      verificationTier,
		VerificationStatus:    verificationStatus,
		SubscriptionPlan:      subscriptionPlan,
		SubscriptionStatus:    subscriptionStatus,
		SubscriptionExpiresAt: subscriptionExpiresAt,
		CreatedAt:             now,
	}
	if b != nil {
		var existing UserProfile
		if err := json.Unmarshal(b, &existing); err != nil {
			return err
		}
		profile.CreatedAt = existing.CreatedAt
	}
	if err := s.putWithCompositeKey(ctx, userPrefix, userID, profile); err != nil {
		return err
	}
	return s.appendAudit(ctx, "UPSERT_USER", userPrefix, userID, "User profile upserted")
}

func (s *SmartContract) ReadUserProfile(ctx contractapi.TransactionContextInterface, userID string) (*UserProfile, error) {
	b, err := s.getByCompositeKey(ctx, userPrefix, userID)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, fmt.Errorf("user profile %s not found", userID)
	}
	var p UserProfile
	if err := json.Unmarshal(b, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *SmartContract) PostChatMessage(ctx contractapi.TransactionContextInterface, messageID string, ticker string, authorUserID string, body string, parentID string) error {
	if messageID == "" || ticker == "" || authorUserID == "" || body == "" {
		return fmt.Errorf("messageID, ticker, authorUserID, body are required")
	}
	if exists, _ := s.keyExists(ctx, chatPrefix, messageID); exists {
		return fmt.Errorf("message %s already exists", messageID)
	}
	profile, err := s.ReadUserProfile(ctx, authorUserID)
	if err != nil {
		return err
	}
	if strings.ToUpper(profile.VerificationStatus) != "VERIFIED" {
		return fmt.Errorf("user %s is not verified", authorUserID)
	}
	if strings.ToUpper(profile.SubscriptionStatus) != "ACTIVE" {
		return fmt.Errorf("user %s does not have an active subscription", authorUserID)
	}

	msg := ChatMessage{
		ID:           messageID,
		ObjectType:   chatPrefix,
		Ticker:       strings.ToUpper(ticker),
		AuthorUserID: authorUserID,
		Body:         body,
		ParentID:     parentID,
		CreatedAt:    txTimestampRFC3339(ctx),
	}
	if err := s.putWithCompositeKey(ctx, chatPrefix, messageID, msg); err != nil {
		return err
	}
	return s.appendAudit(ctx, "POST_MESSAGE", chatPrefix, messageID, "Chat message posted")
}

func (s *SmartContract) FlagChatMessage(ctx contractapi.TransactionContextInterface, messageID string, reason string) error {
	b, err := s.getByCompositeKey(ctx, chatPrefix, messageID)
	if err != nil {
		return err
	}
	if b == nil {
		return fmt.Errorf("message %s not found", messageID)
	}
	var msg ChatMessage
	if err := json.Unmarshal(b, &msg); err != nil {
		return err
	}
	msg.IsFlagged = true
	msg.FlagReason = reason
	if err := s.putWithCompositeKey(ctx, chatPrefix, messageID, msg); err != nil {
		return err
	}
	return s.appendAudit(ctx, "FLAG_MESSAGE", chatPrefix, messageID, reason)
}

func (s *SmartContract) ModerateChatMessage(ctx contractapi.TransactionContextInterface, messageID string, action string) error {
	if err := s.requireAdmin(ctx); err != nil {
		return err
	}
	action = strings.ToUpper(action)
	if action != "DELETE" && action != "PIN" && action != "UNPIN" {
		return fmt.Errorf("action must be DELETE, PIN, or UNPIN")
	}
	b, err := s.getByCompositeKey(ctx, chatPrefix, messageID)
	if err != nil {
		return err
	}
	if b == nil {
		return fmt.Errorf("message %s not found", messageID)
	}
	var msg ChatMessage
	if err := json.Unmarshal(b, &msg); err != nil {
		return err
	}

	switch action {
	case "DELETE":
		msg.IsDeleted = true
	case "PIN":
		msg.Pinned = true
	case "UNPIN":
		msg.Pinned = false
	}

	if err := s.putWithCompositeKey(ctx, chatPrefix, messageID, msg); err != nil {
		return err
	}
	return s.appendAudit(ctx, "MODERATE_MESSAGE", chatPrefix, messageID, action)
}

func (s *SmartContract) ListChatMessagesByTicker(ctx contractapi.TransactionContextInterface, ticker string) ([]*ChatMessage, error) {
	entries, err := s.listByType(ctx, chatPrefix)
	if err != nil {
		return nil, err
	}
	out := make([]*ChatMessage, 0)
	needle := strings.ToUpper(ticker)
	for _, b := range entries {
		var msg ChatMessage
		if err := json.Unmarshal(b, &msg); err != nil {
			return nil, err
		}
		if msg.Ticker == needle && !msg.IsDeleted {
			out = append(out, &msg)
		}
	}
	return out, nil
}

func (s *SmartContract) ListAuditLogs(ctx contractapi.TransactionContextInterface) ([]*AuditLog, error) {
	entries, err := s.listByType(ctx, auditPrefix)
	if err != nil {
		return nil, err
	}
	out := make([]*AuditLog, 0, len(entries))
	for _, b := range entries {
		var logItem AuditLog
		if err := json.Unmarshal(b, &logItem); err != nil {
			return nil, err
		}
		out = append(out, &logItem)
	}
	return out, nil
}

func (s *SmartContract) GetHealth(ctx contractapi.TransactionContextInterface) (string, error) {
	return "BISL Fabric contract is alive", nil
}

func (s *SmartContract) calculateSubmissionHash(sub *StockSubmission) string {
	canonical := fmt.Sprintf("%s|%s|%s|%d|%d|%d|%s|%s", sub.Ticker, sub.CompanyName, sub.CUSIP, sub.AuthorizedShares, sub.IssuedOutstandingShares, sub.VerifiedFloat, sub.EffectiveDate, sub.SubmissionTimestamp)
	sum := sha256.Sum256([]byte(canonical))
	return hex.EncodeToString(sum[:])
}

func (s *SmartContract) requireAdmin(ctx contractapi.TransactionContextInterface) error {
	cfg, err := s.getRBAC(ctx)
	if err != nil {
		return err
	}
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	if msp != cfg.AdminMSP {
		return fmt.Errorf("access denied: admin MSP required (%s), got %s", cfg.AdminMSP, msp)
	}
	return nil
}

func (s *SmartContract) requireAgent(ctx contractapi.TransactionContextInterface) error {
	cfg, err := s.getRBAC(ctx)
	if err != nil {
		return err
	}
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	if msp != cfg.AgentMSP {
		return fmt.Errorf("access denied: agent MSP required (%s), got %s", cfg.AgentMSP, msp)
	}
	return nil
}

func (s *SmartContract) getRBAC(ctx contractapi.TransactionContextInterface) (*RBACConfig, error) {
	b, err := ctx.GetStub().GetState(configKey)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, fmt.Errorf("RBAC is not initialized; call InitRBAC first")
	}
	var cfg RBACConfig
	if err := json.Unmarshal(b, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (s *SmartContract) putWithCompositeKey(ctx contractapi.TransactionContextInterface, objectType string, id string, payload interface{}) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	key, err := ctx.GetStub().CreateCompositeKey(objectType, []string{id})
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, b)
}

func (s *SmartContract) getByCompositeKey(ctx contractapi.TransactionContextInterface, objectType string, id string) ([]byte, error) {
	key, err := ctx.GetStub().CreateCompositeKey(objectType, []string{id})
	if err != nil {
		return nil, err
	}
	return ctx.GetStub().GetState(key)
}

func (s *SmartContract) keyExists(ctx contractapi.TransactionContextInterface, objectType string, id string) (bool, error) {
	b, err := s.getByCompositeKey(ctx, objectType, id)
	if err != nil {
		return false, err
	}
	return b != nil, nil
}

func (s *SmartContract) listByType(ctx contractapi.TransactionContextInterface, objectType string) ([][]byte, error) {
	iter, err := ctx.GetStub().GetStateByPartialCompositeKey(objectType, []string{})
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	out := make([][]byte, 0)
	for iter.HasNext() {
		kv, nextErr := iter.Next()
		if nextErr != nil {
			return nil, nextErr
		}
		out = append(out, kv.Value)
	}
	return out, nil
}

func (s *SmartContract) appendAudit(ctx contractapi.TransactionContextInterface, action string, entity string, entityID string, details string) error {
	actorID, _ := ctx.GetClientIdentity().GetID()
	actorMSP, _ := ctx.GetClientIdentity().GetMSPID()
	auditID := fmt.Sprintf("%s::%s", ctx.GetStub().GetTxID(), entityID)
	item := AuditLog{
		ID:         auditID,
		ObjectType: auditPrefix,
		Action:     action,
		Entity:     entity,
		EntityID:   entityID,
		ActorID:    actorID,
		ActorMSP:   actorMSP,
		Timestamp:  txTimestampRFC3339(ctx),
		Details:    details,
	}
	return s.putWithCompositeKey(ctx, auditPrefix, auditID, item)
}

func txTimestampRFC3339(ctx contractapi.TransactionContextInterface) string {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return time.Now().UTC().Format(time.RFC3339)
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339)
}

func appendIfMissing(items []string, val string) []string {
	for _, item := range items {
		if item == val {
			return items
		}
	}
	return append(items, val)
}
