import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const donor1 = accounts.get("wallet_1")!;
const donor2 = accounts.get("wallet_2")!;
const recipient = accounts.get("wallet_3")!;
const delegate = accounts.get("wallet_4")!;

const contractName = "charitable-dao";

describe("Charitable DAO Contract", () => {
  beforeEach(() => {
    // Reset simnet state before each test
    simnet.setEpoch("3.0");
  });

  describe("Donation Functionality", () => {
    it("should allow users to donate and receive governance tokens", () => {
      const donationAmount = 1000;
      
      const result = simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(donationAmount)],
        donor1
      );
      
      expect(result.result).toBeOk(Cl.uint(donationAmount));
      
      // Check donor balance
      const donorBalance = simnet.callReadOnlyFn(
        contractName,
        "get-donor-balance",
        [Cl.principal(donor1)],
        deployer
      );
      expect(donorBalance.result).toBeUint(donationAmount);
      
      // Check governance tokens
      const governanceTokens = simnet.callReadOnlyFn(
        contractName,
        "get-governance-tokens",
        [Cl.principal(donor1)],
        deployer
      );
      expect(governanceTokens.result).toBeUint(donationAmount);
      
      // Check total donations
      const totalDonations = simnet.callReadOnlyFn(
        contractName,
        "get-total-donations",
        [],
        deployer
      );
      expect(totalDonations.result).toBeUint(donationAmount);
    });

    it("should reject zero amount donations", () => {
      const result = simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(0)],
        donor1
      );
      
      expect(result.result).toBeErr(Cl.uint(101)); // ERR_INVALID_AMOUNT
    });

    it("should accumulate multiple donations correctly", () => {
      // First donation
      simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(500)],
        donor1
      );
      
      // Second donation
      simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(300)],
        donor1
      );
      
      // Check accumulated balance
      const donorBalance = simnet.callReadOnlyFn(
        contractName,
        "get-donor-balance",
        [Cl.principal(donor1)],
        deployer
      );
      expect(donorBalance.result).toBeUint(800);
      
      // Check accumulated governance tokens
      const governanceTokens = simnet.callReadOnlyFn(
        contractName,
        "get-governance-tokens",
        [Cl.principal(donor1)],
        deployer
      );
      expect(governanceTokens.result).toBeUint(800);
    });
  });

  describe("Proposal Functionality", () => {
    beforeEach(() => {
      // Setup: donor1 makes a donation to have governance tokens
      simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(1000)],
        donor1
      );
    });

    it("should allow users to submit proposals", () => {
      const title = "Fund Local Food Bank";
      const description = "Provide funding for the local food bank to help families in need during the winter season.";
      const amount = 500;
      
      const result = simnet.callPublicFn(
        contractName,
        "submit-proposal",
        [
          Cl.stringAscii(title),
          Cl.stringAscii(description),
          Cl.principal(recipient),
          Cl.uint(amount)
        ],
        donor1
      );
      
      expect(result.result).toBeOk(Cl.uint(1));
      
      // Check proposal details
      const proposal = simnet.callReadOnlyFn(
        contractName,
        "get-proposal",
        [Cl.uint(1)],
        deployer
      );
      
      expect(proposal.result).toBeSome(
        Cl.tuple({
          title: Cl.stringAscii(title),
          description: Cl.stringAscii(description),
          recipient: Cl.principal(recipient),
          amount: Cl.uint(amount),
          proposer: Cl.principal(donor1),
          "start-block": Cl.uint(simnet.blockHeight),
          "end-block": Cl.uint(simnet.blockHeight + 1440),
          "yes-votes": Cl.uint(0),
          "no-votes": Cl.uint(0),
          executed: Cl.bool(false),
          active: Cl.bool(true)
        })
      );
    });

    it("should reject proposals with zero amount", () => {
      const result = simnet.callPublicFn(
        contractName,
        "submit-proposal",
        [
          Cl.stringAscii("Test Proposal"),
          Cl.stringAscii("Test Description"),
          Cl.principal(recipient),
          Cl.uint(0)
        ],
        donor1
      );
      
      expect(result.result).toBeErr(Cl.uint(101)); // ERR_INVALID_AMOUNT
    });

    it("should reject proposals with invalid recipients", () => {
      const result = simnet.callPublicFn(
        contractName,
        "submit-proposal",
        [
          Cl.stringAscii("Test Proposal"),
          Cl.stringAscii("Test Description"),
          Cl.principal(deployer), // Contract owner as recipient should be invalid
          Cl.uint(500)
        ],
        donor1
      );
      
      expect(result.result).toBeErr(Cl.uint(107)); // ERR_INVALID_RECIPIENT
    });

    it("should increment proposal counter correctly", () => {
      // Submit first proposal
      simnet.callPublicFn(
        contractName,
        "submit-proposal",
        [
          Cl.stringAscii("Proposal 1"),
          Cl.stringAscii("Description 1"),
          Cl.principal(recipient),
          Cl.uint(500)
        ],
        donor1
      );
      
      // Submit second proposal
      const result2 = simnet.callPublicFn(
        contractName,
        "submit-proposal",
        [
          Cl.stringAscii("Proposal 2"),
          Cl.stringAscii("Description 2"),
          Cl.principal(recipient),
          Cl.uint(300)
        ],
        donor1
      );
      
      expect(result2.result).toBeOk(Cl.uint(2));
      
      // Check proposal count
      const proposalCount = simnet.callReadOnlyFn(
        contractName,
        "get-proposal-count",
        [],
        deployer
      );
      expect(proposalCount.result).toBeUint(2);
    });
  });

  describe("Voting Functionality", () => {
    beforeEach(() => {
      // Setup: donors make donations and a proposal is submitted
      simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(1000)],
        donor1
      );
      
      simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(500)],
        donor2
      );
      
      simnet.callPublicFn(
        contractName,
        "submit-proposal",
        [
          Cl.stringAscii("Test Proposal"),
          Cl.stringAscii("Test Description"),
          Cl.principal(recipient),
          Cl.uint(500)
        ],
        donor1
      );
    });

    it("should allow token holders to vote on proposals", () => {
      const result = simnet.callPublicFn(
        contractName,
        "vote",
        [Cl.uint(1), Cl.bool(true)], // Vote yes on proposal 1
        donor1
      );
      
      expect(result.result).toBeOk(Cl.bool(true));
      
      // Check if vote was recorded
      const hasVoted = simnet.callReadOnlyFn(
        contractName,
        "has-voted",
        [Cl.uint(1), Cl.principal(donor1)],
        deployer
      );
      expect(hasVoted.result).toBeBool(true);
      
      // Check proposal vote counts
      const proposal = simnet.callReadOnlyFn(
        contractName,
        "get-proposal",
        [Cl.uint(1)],
        deployer
      );
      
      const proposalData = proposal.result.expectSome();
      expect(proposalData.expectTuple()["yes-votes"]).toBeUint(1000);
      expect(proposalData.expectTuple()["no-votes"]).toBeUint(0);
    });

    it("should prevent double voting", () => {
      // First vote
      simnet.callPublicFn(
        contractName,
        "vote",
        [Cl.uint(1), Cl.bool(true)],
        donor1
      );
      
      // Second vote attempt
      const result = simnet.callPublicFn(
        contractName,
        "vote",
        [Cl.uint(1), Cl.bool(false)],
        donor1
      );
      
      expect(result.result).toBeErr(Cl.uint(104)); // ERR_ALREADY_VOTED
    });

    it("should prevent voting without governance tokens", () => {
      const result = simnet.callPublicFn(
        contractName,
        "vote",
        [Cl.uint(1), Cl.bool(true)],
        recipient // recipient has no governance tokens
      );
      
      expect(result.result).toBeErr(Cl.uint(105)); // ERR_INSUFFICIENT_TOKENS
    });

    it("should count votes correctly with different token amounts", () => {
      // donor1 votes yes (1000 tokens)
      simnet.callPublicFn(
        contractName,
        "vote",
        [Cl.uint(1), Cl.bool(true)],
        donor1
      );
      
      // donor2 votes no (500 tokens)
      simnet.callPublicFn(
        contractName,
        "vote",
        [Cl.uint(1), Cl.bool(false)],
        donor2
      );
      
      // Check vote counts
      const proposal = simnet.callReadOnlyFn(
        contractName,
        "get-proposal",
        [Cl.uint(1)],
        deployer
      );
      
      const proposalData = proposal.result.expectSome();
      expect(proposalData.expectTuple()["yes-votes"]).toBeUint(1000);
      expect(proposalData.expectTuple()["no-votes"]).toBeUint(500);
    });
  });

  describe("Proposal Execution", () => {
    beforeEach(() => {
      // Setup: donors make donations and a proposal is submitted
      simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(1000)],
        donor1
      );
      
      simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(500)],
        donor2
      );
      
      simnet.callPublicFn(
        contractName,
        "submit-proposal",
        [
          Cl.stringAscii("Test Proposal"),
          Cl.stringAscii("Test Description"),
          Cl.principal(recipient),
          Cl.uint(500)
        ],
        donor1
      );
      
      // Both donors vote yes to ensure proposal passes
      simnet.callPublicFn(
        contractName,
        "vote",
        [Cl.uint(1), Cl.bool(true)],
        donor1
      );
      
      simnet.callPublicFn(
        contractName,
        "vote",
        [Cl.uint(1), Cl.bool(true)],
        donor2
      );
    });

    it("should execute proposal after voting period ends and it passes", () => {
      // Advance blocks to end voting period
      simnet.mineEmptyBlocks(1441);
      
      const result = simnet.callPublicFn(
        contractName,
        "execute-proposal",
        [Cl.uint(1)],
        donor1
      );
      
      expect(result.result).toBeOk(Cl.bool(true));
      
      // Check that proposal is marked as executed
      const proposal = simnet.callReadOnlyFn(
        contractName,
        "get-proposal",
        [Cl.uint(1)],
        deployer
      );
      
      const proposalData = proposal.result.expectSome();
      expect(proposalData.expectTuple().executed).toBeBool(true);
      expect(proposalData.expectTuple().active).toBeBool(false);
    });

    it("should prevent execution before voting period ends", () => {
      const result = simnet.callPublicFn(
        contractName,
        "execute-proposal",
        [Cl.uint(1)],
        donor1
      );
      
      expect(result.result).toBeErr(Cl.uint(103)); // ERR_PROPOSAL_EXPIRED
    });

    it("should prevent execution of non-existent proposals", () => {
      simnet.mineEmptyBlocks(1441);
      
      const result = simnet.callPublicFn(
        contractName,
        "execute-proposal",
        [Cl.uint(999)], // Non-existent proposal
        donor1
      );
      
      expect(result.result).toBeErr(Cl.uint(102)); // ERR_PROPOSAL_NOT_FOUND
    });
  });

  describe("Vote Delegation", () => {
    beforeEach(() => {
      // Setup: donor1 makes a donation
      simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(1000)],
        donor1
      );
    });

    it("should allow users to delegate their voting power", () => {
      const result = simnet.callPublicFn(
        contractName,
        "delegate-votes",
        [Cl.principal(delegate)],
        donor1
      );
      
      expect(result.result).toBeOk(Cl.bool(true));
      
      // Check delegation
      const delegateResult = simnet.callReadOnlyFn(
        contractName,
        "get-delegate",
        [Cl.principal(donor1)],
        deployer
      );
      expect(delegateResult.result).toBeSome(Cl.principal(delegate));
    });

    it("should allow users to undelegate their votes", () => {
      // First delegate
      simnet.callPublicFn(
        contractName,
        "delegate-votes",
        [Cl.principal(delegate)],
        donor1
      );
      
      // Then undelegate
      const result = simnet.callPublicFn(
        contractName,
        "undelegate-votes",
        [],
        donor1
      );
      
      expect(result.result).toBeOk(Cl.bool(true));
      
      // Check that delegation is removed
      const delegateResult = simnet.callReadOnlyFn(
        contractName,
        "get-delegate",
        [Cl.principal(donor1)],
        deployer
      );
      expect(delegateResult.result).toBeNone();
    });

    it("should prevent self-delegation", () => {
      const result = simnet.callPublicFn(
        contractName,
        "delegate-votes",
        [Cl.principal(donor1)], // Self-delegation
        donor1
      );
      
      expect(result.result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });
  });

  describe("Read-only Functions", () => {
    beforeEach(() => {
      // Setup some test data
      simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(1000)],
        donor1
      );
      
      simnet.callPublicFn(
        contractName,
        "donate",
        [Cl.uint(500)],
        donor2
      );
    });

    it("should return correct voting power", () => {
      const votingPower = simnet.callReadOnlyFn(
        contractName,
        "get-voting-power",
        [Cl.principal(donor1)],
        deployer
      );
      
      expect(votingPower.result).toBeUint(1000);
    });

    it("should return correct total governance tokens", () => {
      const totalTokens = simnet.callReadOnlyFn(
        contractName,
        "get-total-governance-tokens",
        [],
        deployer
      );
      
      expect(totalTokens.result).toBeUint(1500); // 1000 + 500
    });

    it("should return zero for non-existent balances", () => {
      const balance = simnet.callReadOnlyFn(
        contractName,
        "get-donor-balance",
        [Cl.principal(recipient)], // recipient never donated
        deployer
      );
      
      expect(balance.result).toBeUint(0);
    });
  });
});