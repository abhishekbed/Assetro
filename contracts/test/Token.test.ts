import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFullSuite, DeployedSuite } from "./helpers/fixtures";

describe("Token", function () {
  let s: DeployedSuite;

  beforeEach(async function () {
    s = await deployFullSuite();
    await s.verifyInvestor(s.alice);
    await s.verifyInvestor(s.bob);
    await s.token.connect(s.agent).unpause();
    await s.token.connect(s.agent).mint(s.alice.address, ethers.parseUnits("1000", 18));
  });

  describe("Deployment", function () {
    it("initializes with the correct name, symbol and decimals", async function () {
      expect(await s.token.name()).to.equal("Test Security Token");
      expect(await s.token.symbol()).to.equal("TST");
      expect(await s.token.decimals()).to.equal(18);
    });

    it("sets the deployer as owner after factory handoff", async function () {
      expect(await s.token.owner()).to.equal(s.deployer.address);
    });

    it("is paused by default on deployment", async function () {
      const fresh = await deployFullSuite();
      expect(await fresh.token.paused()).to.equal(true);
    });
  });

  describe("Transfers", function () {
    it("allows transfer between two verified investors", async function () {
      await s.token.connect(s.alice).transfer(s.bob.address, ethers.parseUnits("100", 18));
      expect(await s.token.balanceOf(s.bob.address)).to.equal(ethers.parseUnits("100", 18));
    });

    it("blocks transfer to a wallet with no registered identity", async function () {
      await expect(
        s.token.connect(s.alice).transfer(s.outsider.address, ethers.parseUnits("1", 18)),
      ).to.be.reverted;
    });

    it("blocks all transfers while the token is paused", async function () {
      await s.token.connect(s.agent).pause();
      await expect(
        s.token.connect(s.alice).transfer(s.bob.address, ethers.parseUnits("1", 18)),
      ).to.be.reverted;
    });
  });

  describe("Mint / Burn (agent only)", function () {
    it("lets the agent mint to a verified investor", async function () {
      await s.token.connect(s.agent).mint(s.bob.address, ethers.parseUnits("50", 18));
      expect(await s.token.balanceOf(s.bob.address)).to.equal(ethers.parseUnits("50", 18));
    });

    it("refuses to mint to an unverified wallet", async function () {
      await expect(
        s.token.connect(s.agent).mint(s.outsider.address, ethers.parseUnits("1", 18)),
      ).to.be.revertedWith("Identity is not verified.");
    });

    it("refuses mint from a non-agent caller", async function () {
      await expect(
        s.token.connect(s.alice).mint(s.alice.address, ethers.parseUnits("1", 18)),
      ).to.be.reverted;
    });

    it("lets the agent burn an investor's tokens", async function () {
      await s.token.connect(s.agent).burn(s.alice.address, ethers.parseUnits("100", 18));
      expect(await s.token.balanceOf(s.alice.address)).to.equal(ethers.parseUnits("900", 18));
    });
  });

  describe("Pause / Unpause", function () {
    it("toggles paused state (agent only)", async function () {
      await s.token.connect(s.agent).pause();
      expect(await s.token.paused()).to.equal(true);
      await s.token.connect(s.agent).unpause();
      expect(await s.token.paused()).to.equal(false);
    });

    it("refuses pause from a non-agent caller", async function () {
      await expect(s.token.connect(s.alice).pause()).to.be.reverted;
    });
  });

  describe("Freeze / Unfreeze", function () {
    it("blocks transfers from a fully frozen address", async function () {
      await s.token.connect(s.agent).setAddressFrozen(s.alice.address, true);
      await expect(
        s.token.connect(s.alice).transfer(s.bob.address, ethers.parseUnits("1", 18)),
      ).to.be.revertedWith("wallet is frozen");
    });

    it("allows transfer again after unfreezing", async function () {
      await s.token.connect(s.agent).setAddressFrozen(s.alice.address, true);
      await s.token.connect(s.agent).setAddressFrozen(s.alice.address, false);
      await s.token.connect(s.alice).transfer(s.bob.address, ethers.parseUnits("1", 18));
      expect(await s.token.balanceOf(s.bob.address)).to.equal(ethers.parseUnits("1", 18));
    });

    it("blocks transfer of partially frozen tokens beyond the free balance", async function () {
      await s.token.connect(s.agent).freezePartialTokens(s.alice.address, ethers.parseUnits("950", 18));
      // free balance is 50 — transferring 100 should fail
      await expect(
        s.token.connect(s.alice).transfer(s.bob.address, ethers.parseUnits("100", 18)),
      ).to.be.revertedWith("Insufficient Balance");
      // transferring within the free balance succeeds
      await s.token.connect(s.alice).transfer(s.bob.address, ethers.parseUnits("40", 18));
      expect(await s.token.balanceOf(s.bob.address)).to.equal(ethers.parseUnits("40", 18));
    });
  });

  describe("Forced transfer (regulatory override)", function () {
    it("lets the agent force a transfer between two verified investors", async function () {
      await s.token.connect(s.agent).forcedTransfer(s.alice.address, s.bob.address, ethers.parseUnits("200", 18));
      expect(await s.token.balanceOf(s.bob.address)).to.equal(ethers.parseUnits("200", 18));
    });

    it("refuses a forced transfer to an unverified wallet", async function () {
      await expect(
        s.token.connect(s.agent).forcedTransfer(s.alice.address, s.outsider.address, ethers.parseUnits("1", 18)),
      ).to.be.revertedWith("Transfer not possible");
    });

    it("auto-unfreezes just enough tokens to satisfy a forced transfer", async function () {
      await s.token.connect(s.agent).freezePartialTokens(s.alice.address, ethers.parseUnits("1000", 18));
      await s.token.connect(s.agent).forcedTransfer(s.alice.address, s.bob.address, ethers.parseUnits("300", 18));
      expect(await s.token.balanceOf(s.bob.address)).to.equal(ethers.parseUnits("300", 18));
    });
  });

  describe("Recovery (lost wallet)", function () {
    it("moves balance and identity registration to the new wallet", async function () {
      // Add charlie's address as a new management key on alice's existing
      // identity (simulating "this is my new wallet"), then recover.
      const aliceIdentity = await ethers.getContractAt(
        "Identity",
        await s.ir.identity(s.alice.address),
      );
      const newWalletKeyHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [s.charlie.address]),
      );
      await aliceIdentity.connect(s.alice).addKey(newWalletKeyHash, 1, 1);

      await s.token.connect(s.agent).recoveryAddress(
        s.alice.address,
        s.charlie.address,
        await aliceIdentity.getAddress(),
      );

      expect(await s.token.balanceOf(s.charlie.address)).to.equal(ethers.parseUnits("1000", 18));
      expect(await s.token.balanceOf(s.alice.address)).to.equal(0);
      expect(await s.ir.contains(s.charlie.address)).to.equal(true);
      expect(await s.ir.contains(s.alice.address)).to.equal(false);
    });

    it("reverts recovery if the new wallet does not hold the identity's management key", async function () {
      const aliceIdentity = await ethers.getContractAt(
        "Identity",
        await s.ir.identity(s.alice.address),
      );
      await expect(
        s.token.connect(s.agent).recoveryAddress(
          s.alice.address,
          s.charlie.address,
          await aliceIdentity.getAddress(),
        ),
      ).to.be.revertedWith("Recovery not possible");
    });
  });
});
