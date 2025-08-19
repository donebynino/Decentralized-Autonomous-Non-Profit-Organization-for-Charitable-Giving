;; Charitable DAO Smart Contract
;; A decentralized autonomous organization for transparent charitable giving
;; Built on Stacks blockchain using sBTC for donations

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_INVALID_AMOUNT (err u101))
(define-constant ERR_PROPOSAL_NOT_FOUND (err u102))
(define-constant ERR_PROPOSAL_EXPIRED (err u103))
(define-constant ERR_ALREADY_VOTED (err u104))
(define-constant ERR_INSUFFICIENT_TOKENS (err u105))
(define-constant ERR_PROPOSAL_NOT_ACTIVE (err u106))
(define-constant ERR_INVALID_RECIPIENT (err u107))

;; Data Variables
(define-data-var total-donations uint u0)
(define-data-var total-governance-tokens uint u0)
(define-data-var proposal-counter uint u0)
(define-data-var voting-period uint u1440) ;; 1440 blocks (~1 day)
(define-data-var quorum-threshold uint u50) ;; 50% quorum required

;; Data Maps
(define-map donor-balances principal uint)
(define-map governance-tokens principal uint)
(define-map proposals uint {
    title: (string-ascii 100),
    description: (string-ascii 500),
    recipient: principal,
    amount: uint,
    proposer: principal,
    start-block: uint,
    end-block: uint,
    yes-votes: uint,
    no-votes: uint,
    executed: bool,
    active: bool
})
(define-map proposal-votes {proposal-id: uint, voter: principal} bool)
(define-map delegated-votes principal principal) ;; delegator -> delegate

;; SIP-010 Fungible Token Trait for Governance Tokens
(define-fungible-token governance-token)

;; Public Functions

;; Donate sBTC to the DAO treasury and receive governance tokens
(define-public (donate (amount uint))
    (let (
        (sender tx-sender)
        (current-donations (default-to u0 (map-get? donor-balances sender)))
        (tokens-to-mint amount) ;; 1:1 ratio for simplicity
    )
        (asserts! (> amount u0) ERR_INVALID_AMOUNT)
        
        ;; Transfer sBTC to contract (simplified - in real implementation would use sBTC token)
        ;; For this demo, we'll track the donation amount
        
        ;; Update donor balance
        (map-set donor-balances sender (+ current-donations amount))
        
        ;; Mint governance tokens
        (try! (ft-mint? governance-token tokens-to-mint sender))
        
        ;; Update governance token balance
        (let ((current-tokens (default-to u0 (map-get? governance-tokens sender))))
            (map-set governance-tokens sender (+ current-tokens tokens-to-mint))
        )
        
        ;; Update totals
        (var-set total-donations (+ (var-get total-donations) amount))
        (var-set total-governance-tokens (+ (var-get total-governance-tokens) tokens-to-mint))
        
        (print {event: "donation", donor: sender, amount: amount, tokens-minted: tokens-to-mint})
        (ok tokens-to-mint)
    )
)

;; Submit a funding proposal
(define-public (submit-proposal (title (string-ascii 100)) (description (string-ascii 500)) (recipient principal) (amount uint))
    (let (
        (proposal-id (+ (var-get proposal-counter) u1))
        (start-block block-height)
        (end-block (+ block-height (var-get voting-period)))
        (sender tx-sender)
    )
        (asserts! (> amount u0) ERR_INVALID_AMOUNT)
        (asserts! (is-valid-recipient recipient) ERR_INVALID_RECIPIENT)
        
        ;; Create proposal
        (map-set proposals proposal-id {
            title: title,
            description: description,
            recipient: recipient,
            amount: amount,
            proposer: sender,
            start-block: start-block,
            end-block: end-block,
            yes-votes: u0,
            no-votes: u0,
            executed: false,
            active: true
        })
        
        ;; Update proposal counter
        (var-set proposal-counter proposal-id)
        
        (print {event: "proposal-submitted", proposal-id: proposal-id, proposer: sender, recipient: recipient, amount: amount})
        (ok proposal-id)
    )
)

;; Vote on a proposal
(define-public (vote (proposal-id uint) (support bool))
    (let (
        (voter tx-sender)
        (proposal (unwrap! (map-get? proposals proposal-id) ERR_PROPOSAL_NOT_FOUND))
        (voter-tokens (get-voting-power voter))
        (vote-key {proposal-id: proposal-id, voter: voter})
    )
        (asserts! (get active proposal) ERR_PROPOSAL_NOT_ACTIVE)
        (asserts! (<= block-height (get end-block proposal)) ERR_PROPOSAL_EXPIRED)
        (asserts! (is-none (map-get? proposal-votes vote-key)) ERR_ALREADY_VOTED)
        (asserts! (> voter-tokens u0) ERR_INSUFFICIENT_TOKENS)
        
        ;; Record vote
        (map-set proposal-votes vote-key true)
        
        ;; Update vote counts
        (if support
            (map-set proposals proposal-id (merge proposal {yes-votes: (+ (get yes-votes proposal) voter-tokens)}))
            (map-set proposals proposal-id (merge proposal {no-votes: (+ (get no-votes proposal) voter-tokens)}))
        )
        
        (print {event: "vote-cast", proposal-id: proposal-id, voter: voter, support: support, tokens: voter-tokens})
        (ok true)
    )
)

;; Execute a proposal if it has passed
(define-public (execute-proposal (proposal-id uint))
    (let (
        (proposal (unwrap! (map-get? proposals proposal-id) ERR_PROPOSAL_NOT_FOUND))
        (total-votes (+ (get yes-votes proposal) (get no-votes proposal)))
        (total-tokens (var-get total-governance-tokens))
        (quorum-met (>= (* total-votes u100) (* total-tokens (var-get quorum-threshold))))
        (proposal-passed (> (get yes-votes proposal) (get no-votes proposal)))
    )
        (asserts! (get active proposal) ERR_PROPOSAL_NOT_ACTIVE)
        (asserts! (> block-height (get end-block proposal)) ERR_PROPOSAL_EXPIRED)
        (asserts! (not (get executed proposal)) ERR_PROPOSAL_NOT_ACTIVE)
        (asserts! quorum-met ERR_INSUFFICIENT_TOKENS)
        (asserts! proposal-passed ERR_UNAUTHORIZED)
        
        ;; Mark proposal as executed
        (map-set proposals proposal-id (merge proposal {executed: true, active: false}))
        
        ;; In a real implementation, this would transfer sBTC to the recipient
        ;; For this demo, we'll just emit an event
        
        (print {event: "proposal-executed", proposal-id: proposal-id, recipient: (get recipient proposal), amount: (get amount proposal)})
        (ok true)
    )
)

;; Delegate voting power to another address
(define-public (delegate-votes (delegate principal))
    (let ((delegator tx-sender))
        (asserts! (not (is-eq delegator delegate)) ERR_UNAUTHORIZED)
        (map-set delegated-votes delegator delegate)
        (print {event: "votes-delegated", delegator: delegator, delegate: delegate})
        (ok true)
    )
)

;; Remove vote delegation
(define-public (undelegate-votes)
    (let ((delegator tx-sender))
        (map-delete delegated-votes delegator)
        (print {event: "votes-undelegated", delegator: delegator})
        (ok true)
    )
)

;; Read-only Functions

;; Get donor balance
(define-read-only (get-donor-balance (donor principal))
    (default-to u0 (map-get? donor-balances donor))
)

;; Get governance token balance
(define-read-only (get-governance-tokens (holder principal))
    (default-to u0 (map-get? governance-tokens holder))
)

;; Get proposal details
(define-read-only (get-proposal (proposal-id uint))
    (map-get? proposals proposal-id)
)

;; Get voting power (including delegated votes)
(define-read-only (get-voting-power (voter principal))
    (let (
        (own-tokens (get-governance-tokens voter))
        (delegated-tokens (get-delegated-voting-power voter))
    )
        (+ own-tokens delegated-tokens)
    )
)

;; Get delegated voting power
(define-read-only (get-delegated-voting-power (delegate principal))
    (fold + (map get-governance-tokens (get-delegators delegate)) u0)
)

;; Get total donations
(define-read-only (get-total-donations)
    (var-get total-donations)
)

;; Get total governance tokens
(define-read-only (get-total-governance-tokens)
    (var-get total-governance-tokens)
)

;; Get proposal count
(define-read-only (get-proposal-count)
    (var-get proposal-counter)
)

;; Check if user has voted on proposal
(define-read-only (has-voted (proposal-id uint) (voter principal))
    (is-some (map-get? proposal-votes {proposal-id: proposal-id, voter: voter}))
)

;; Get vote delegation
(define-read-only (get-delegate (delegator principal))
    (map-get? delegated-votes delegator)
)

;; Private Functions

;; Validate recipient address
(define-private (is-valid-recipient (recipient principal))
    (and 
        (not (is-eq recipient (as-contract tx-sender)))
        (not (is-eq recipient CONTRACT_OWNER))
    )
)

;; Get list of delegators for a delegate (simplified implementation)
(define-private (get-delegators (delegate principal))
    ;; In a real implementation, this would maintain a list of delegators
    ;; For this demo, we'll return an empty list
    (list)
)

;; Initialize contract
(begin
    (print {event: "contract-deployed", deployer: CONTRACT_OWNER})
)