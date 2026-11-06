import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFullSuite, deployModule, DeployedSuite } from "./helpers/fixtures";
import {
  MaxBalanceModule,
  MaxHolderModule,
  SenderWhitelistModule,
  TransferWindowModule,
  DayMonthLimitsModule,
} from "../typechain-types";

const E18 = (n: number) => ethers.parseUnits(n.toString(), 18);
const NOT_SUITABLE = "compliance is not suitable for binding to the module";

/**
 * Regression tests for the compliance-module defects found in the audit.
 * Each test asserts the corrected behaviour; before the fixes they failed.
 */
describe("Compliance module fixes", function () {
  let s: DeployedSuite;

  beforeEach(async function () {
    s = await deployFullSuite();
    await s.token.connect(s.agent).unpause();
  });

  it("H-1 MaxBalance: refuses to bind to a live token, and seeding makes it safe", async function () {
    const alice = await s.verifyInvestor(s.alice);
    await s.verifyInvestor(s.bob);
    await s.token.connect(s.agent).mint(s.alice.address, E18(100));

    const mb = await deployModule<MaxBalanceModule>("MaxBalanceModule");
    const addr = await mb.getAddress();
    const mcAddr = await s.mc.getAddress();

    // Was: canComplianceBind returned true unconditionally, the bind succeeded,
    // and every later transfer/burn reverted with panic 0x11 forever.
    expect(await mb.isPlugAndPlay()).to.equal(false);
    expect(await mb.canComplianceBind(mcAddr)).to.equal(false);
    await expect(s.mc.connect(s.deployer).addModule(addr)).to.be.revertedWith(NOT_SUITABLE);

    // Seeding the existing holder makes the bind legal.
    await mb
      .connect(s.deployer)
      .batchPreSetModuleState(mcAddr, [await alice.getAddress()], [E18(100)]);
    expect(await mb.canComplianceBind(mcAddr)).to.equal(true);
    await s.mc.connect(s.deployer).addModule(addr);
    await s.mc
      .connect(s.deployer)
      .callModuleFunction(mb.interface.encodeFunctionData("setMaxBalance", [E18(1000)]), addr);

    // No longer bricked.
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.not.be.reverted;
    await expect(s.token.connect(s.agent).burn(s.alice.address, E18(1))).to.not.be.reverted;
  });

  it("H-1b MaxBalance: still enforces the cap after binding", async function () {
    const mb = await deployModule<MaxBalanceModule>("MaxBalanceModule");
    const addr = await mb.getAddress();
    await s.mc.connect(s.deployer).addModule(addr);
    await s.mc
      .connect(s.deployer)
      .callModuleFunction(mb.interface.encodeFunctionData("setMaxBalance", [E18(100)]), addr);

    await s.verifyInvestor(s.alice);
    await expect(s.token.connect(s.agent).mint(s.alice.address, E18(100))).to.not.be.reverted;
    await expect(s.token.connect(s.agent).mint(s.alice.address, E18(1))).to.be.revertedWith(
      "Compliance not followed",
    );
  });

  it("M-1 MaxHolder: refuses a live token, and enforces the cap once seeded", async function () {
    await s.verifyInvestor(s.alice);
    await s.verifyInvestor(s.bob);
    await s.verifyInvestor(s.charlie);
    await s.token.connect(s.agent).mint(s.alice.address, E18(10));
    await s.token.connect(s.agent).mint(s.bob.address, E18(10));

    const mh = await deployModule<MaxHolderModule>("MaxHolderModule");
    const addr = await mh.getAddress();
    const mcAddr = await s.mc.getAddress();

    // Was: bound happily and started counting from 0, so the cap never applied.
    expect(await mh.canComplianceBind(mcAddr)).to.equal(false);
    await expect(s.mc.connect(s.deployer).addModule(addr)).to.be.revertedWith(NOT_SUITABLE);

    await mh.connect(s.deployer).preSetHolders(mcAddr, [s.alice.address, s.bob.address]);
    expect(await mh.getHolderCount(mcAddr)).to.equal(2n);

    await s.mc.connect(s.deployer).addModule(addr);
    await s.mc
      .connect(s.deployer)
      .callModuleFunction(mh.interface.encodeFunctionData("setMaxHolders", [2]), addr);

    // A third holder is now correctly refused.
    await expect(s.token.connect(s.agent).mint(s.charlie.address, E18(10))).to.be.revertedWith(
      "Compliance not followed",
    );
  });

  it("M-2 MaxHolder: allows a full exit at the cap", async function () {
    const mh = await deployModule<MaxHolderModule>("MaxHolderModule");
    const addr = await mh.getAddress();
    await s.mc.connect(s.deployer).addModule(addr);
    await s.mc
      .connect(s.deployer)
      .callModuleFunction(mh.interface.encodeFunctionData("setMaxHolders", [2]), addr);

    await s.verifyInvestor(s.alice);
    await s.verifyInvestor(s.bob);
    await s.verifyInvestor(s.charlie);
    await s.token.connect(s.agent).mint(s.alice.address, E18(10));
    await s.token.connect(s.agent).mint(s.bob.address, E18(10));
    expect(await mh.getHolderCount(await s.mc.getAddress())).to.equal(2n);

    // Was: rejected, freezing the holder set and stranding investors.
    await expect(s.token.connect(s.alice).transfer(s.charlie.address, E18(10))).to.not.be.reverted;
    // A partial transfer to a new holder would exceed the cap, so still refused.
    await expect(s.token.connect(s.bob).transfer(s.alice.address, E18(1))).to.be.revertedWith(
      "Transfer not possible",
    );
  });

  it("M-3 SenderWhitelist: emptying the list fails closed, not open", async function () {
    const sw = await deployModule<SenderWhitelistModule>("SenderWhitelistModule");
    const addr = await sw.getAddress();
    await s.mc.connect(s.deployer).addModule(addr);

    await s.verifyInvestor(s.alice);
    await s.verifyInvestor(s.bob);
    await s.token.connect(s.agent).mint(s.alice.address, E18(10));

    // Dormant until configured, so binding alone does not brick transfers.
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.not.be.reverted;

    await s.mc
      .connect(s.deployer)
      .callModuleFunction(sw.interface.encodeFunctionData("addSender", [s.bob.address]), addr);
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.be.revertedWith(
      "Transfer not possible",
    );

    // Was: removing the last sender silently switched the allowlist OFF.
    await s.mc
      .connect(s.deployer)
      .callModuleFunction(sw.interface.encodeFunctionData("removeSender", [s.bob.address]), addr);
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.be.revertedWith(
      "Transfer not possible",
    );

    // Standing it down is now an explicit act.
    await s.mc
      .connect(s.deployer)
      .callModuleFunction(sw.interface.encodeFunctionData("deactivateRestriction", []), addr);
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.not.be.reverted;
  });

  it("M-5 TransferWindow: a blackout stops transfers but not minting", async function () {
    const tw = await deployModule<TransferWindowModule>("TransferWindowModule");
    const addr = await tw.getAddress();
    await s.mc.connect(s.deployer).addModule(addr);
    await s.verifyInvestor(s.alice);
    await s.verifyInvestor(s.bob);
    await s.token.connect(s.agent).mint(s.alice.address, E18(10));

    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await s.mc
      .connect(s.deployer)
      .callModuleFunction(
        tw.interface.encodeFunctionData("activateBlackout", [now, now + 86400]),
        addr,
      );

    // Was: primary issuance was blocked too.
    await expect(s.token.connect(s.agent).mint(s.alice.address, E18(10))).to.not.be.reverted;
    // Secondary transfers are still correctly blocked.
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.be.revertedWith(
      "Transfer not possible",
    );
  });

  it("M-4 DayMonthLimits: a deregistered sender no longer bypasses the cap", async function () {
    const dm = await deployModule<DayMonthLimitsModule>("DayMonthLimitsModule");
    const addr = await dm.getAddress();
    await s.mc.connect(s.deployer).addModule(addr);
    await s.mc
      .connect(s.deployer)
      .callModuleFunction(dm.interface.encodeFunctionData("setDailyLimit", [E18(10)]), addr);

    await s.verifyInvestor(s.alice);
    await s.verifyInvestor(s.bob);
    await s.token.connect(s.agent).mint(s.alice.address, E18(100));

    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(50))).to.be.revertedWith(
      "Transfer not possible",
    );
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(5))).to.not.be.reverted;

    await s.ir.connect(s.deployer).deleteIdentity(s.alice.address);
    expect(await s.token.balanceOf(s.alice.address)).to.equal(E18(95));

    // Was: unlimited once the identity was gone.
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(50))).to.be.revertedWith(
      "Transfer not possible",
    );
  });

  it("M-4b DayMonthLimits: token agents are not throttled by investor caps", async function () {
    const dm = await deployModule<DayMonthLimitsModule>("DayMonthLimitsModule");
    const addr = await dm.getAddress();
    await s.mc.connect(s.deployer).addModule(addr);
    await s.mc
      .connect(s.deployer)
      .callModuleFunction(dm.interface.encodeFunctionData("setDailyLimit", [E18(10)]), addr);

    await s.verifyInvestor(s.agent);
    await s.verifyInvestor(s.bob);
    await s.token.connect(s.agent).mint(s.agent.address, E18(100));

    // The agent moves more than the investor daily cap and is allowed through.
    await expect(s.token.connect(s.agent).transfer(s.bob.address, E18(60))).to.not.be.reverted;
  });
});
