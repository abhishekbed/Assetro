import { expect } from "chai";
import { ethers } from "hardhat";
import {
  deployFullSuite,
  deployModule,
  DeployedSuite,
} from "./helpers/fixtures";
import {
  CountryRestrictModule,
  MaxHolderModule,
  TransferWindowModule,
  SupplyLimitModule,
  MaxBalanceModule,
  DayMonthLimitsModule,
  ExchangeMonthlyLimitsModule,
  TransferFeeModule,
  SenderWhitelistModule,
} from "../typechain-types";

const USA = 840;
const CHINA = 156;
const E18 = (n: number) => ethers.parseUnits(n.toString(), 18);

describe("ModularCompliance core", function () {
  let s: DeployedSuite;

  beforeEach(async function () {
    s = await deployFullSuite();
  });

  it("only the owner (issuer) can bind a module", async function () {
    // SupplyLimit is plug-and-play; TransferFee now requires token-agent
    // status first, which is a separate concern from ownership.
    const mod = await deployModule<SupplyLimitModule>("SupplyLimitModule");
    await expect(s.mc.connect(s.alice).addModule(await mod.getAddress())).to.be.reverted;
    await expect(s.mc.connect(s.deployer).addModule(await mod.getAddress())).to.not.be.reverted;
    expect(await s.mc.isModuleBound(await mod.getAddress())).to.equal(true);
  });

  it("only the owner can configure a bound module via callModuleFunction", async function () {
    const mod = await deployModule<SupplyLimitModule>("SupplyLimitModule");
    await s.mc.connect(s.deployer).addModule(await mod.getAddress());
    const calldata = mod.interface.encodeFunctionData("setSupplyLimit", [E18(1000)]);
    await expect(
      s.mc.connect(s.alice).callModuleFunction(calldata, await mod.getAddress()),
    ).to.be.reverted;
    await expect(
      s.mc.connect(s.deployer).callModuleFunction(calldata, await mod.getAddress()),
    ).to.not.be.reverted;
    expect(await mod.getSupplyLimit(await s.mc.getAddress())).to.equal(E18(1000));
  });

  it("removeModule unbinds a module so its checks no longer apply", async function () {
    const mod = await deployModule<SenderWhitelistModule>("SenderWhitelistModule");
    await s.mc.connect(s.deployer).addModule(await mod.getAddress());
    expect(await s.mc.isModuleBound(await mod.getAddress())).to.equal(true);
    await s.mc.connect(s.deployer).removeModule(await mod.getAddress());
    expect(await s.mc.isModuleBound(await mod.getAddress())).to.equal(false);
  });

  // Modules are shared platform-wide instances bound once per token, so the
  // issuer portal must never blind-call addModule/removeModule. These tests pin
  // the behaviour that logic depends on.
  it("reverts when binding a module that is already bound", async function () {
    const mod = await deployModule<SupplyLimitModule>("SupplyLimitModule");
    await s.mc.connect(s.deployer).addModule(await mod.getAddress());
    await expect(s.mc.connect(s.deployer).addModule(await mod.getAddress())).to.be.revertedWith(
      "module already bound",
    );
  });

  it("reverts when unbinding a module that is not bound", async function () {
    const mod = await deployModule<SupplyLimitModule>("SupplyLimitModule");
    await expect(s.mc.connect(s.deployer).removeModule(await mod.getAddress())).to.be.revertedWith(
      "module not bound",
    );
  });

  it("keeps a module's per-compliance settings across unbind and rebind", async function () {
    const mod = await deployModule<SupplyLimitModule>("SupplyLimitModule");
    const modAddr = await mod.getAddress();
    const mcAddr = await s.mc.getAddress();

    await s.mc.connect(s.deployer).addModule(modAddr);
    await s.mc
      .connect(s.deployer)
      .callModuleFunction(mod.interface.encodeFunctionData("setSupplyLimit", [E18(777)]), modAddr);
    expect(await mod.getSupplyLimit(mcAddr)).to.equal(E18(777));

    await s.mc.connect(s.deployer).removeModule(modAddr);
    await s.mc.connect(s.deployer).addModule(modAddr);
    // settings are keyed by compliance address and survive the unbind
    expect(await mod.getSupplyLimit(mcAddr)).to.equal(E18(777));
  });

  it("isolates settings between two different tokens sharing one module instance", async function () {
    const mod = await deployModule<SupplyLimitModule>("SupplyLimitModule");
    const modAddr = await mod.getAddress();

    const other = await deployFullSuite();
    await s.mc.connect(s.deployer).addModule(modAddr);
    await other.mc.connect(other.deployer).addModule(modAddr);

    await s.mc
      .connect(s.deployer)
      .callModuleFunction(mod.interface.encodeFunctionData("setSupplyLimit", [E18(100)]), modAddr);
    await other.mc
      .connect(other.deployer)
      .callModuleFunction(mod.interface.encodeFunctionData("setSupplyLimit", [E18(999)]), modAddr);

    expect(await mod.getSupplyLimit(await s.mc.getAddress())).to.equal(E18(100));
    expect(await mod.getSupplyLimit(await other.mc.getAddress())).to.equal(E18(999));
  });
});

describe("CountryRestrictModule", function () {
  it("blocks transfers to a restricted country and allows unrestricted ones", async function () {
    const module = await deployModule<CountryRestrictModule>("CountryRestrictModule");
    const calldata = module.interface.encodeFunctionData("batchRestrictCountries", [[CHINA]]);
    const s = await deployFullSuite({
      complianceModules: [await module.getAddress()],
      complianceSettings: [calldata],
    });

    await s.verifyInvestor(s.alice, USA);
    await s.verifyInvestor(s.bob, CHINA);
    await s.verifyInvestor(s.charlie, USA);
    await s.token.connect(s.agent).unpause();
    await s.token.connect(s.agent).mint(s.alice.address, E18(100));

    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.be.reverted;
    await s.token.connect(s.alice).transfer(s.charlie.address, E18(1));
    expect(await s.token.balanceOf(s.charlie.address)).to.equal(E18(1));
  });
});

describe("MaxHolderModule", function () {
  it("blocks a new distinct holder once the cap is reached, but not top-ups to existing holders", async function () {
    const module = await deployModule<MaxHolderModule>("MaxHolderModule");
    const calldata = module.interface.encodeFunctionData("setMaxHolders", [2]);
    const s = await deployFullSuite({
      complianceModules: [await module.getAddress()],
      complianceSettings: [calldata],
    });

    await s.verifyInvestor(s.alice, USA);
    await s.verifyInvestor(s.bob, USA);
    await s.verifyInvestor(s.charlie, USA);
    await s.token.connect(s.agent).unpause();

    await s.token.connect(s.agent).mint(s.alice.address, E18(10)); // holder 1
    await s.token.connect(s.agent).mint(s.bob.address, E18(10)); // holder 2
    await expect(s.token.connect(s.agent).mint(s.charlie.address, E18(10))).to.be.revertedWith(
      "Compliance not followed",
    );
    // top-up of an existing holder must still work, even at the cap
    await s.token.connect(s.agent).mint(s.alice.address, E18(5));
    expect(await s.token.balanceOf(s.alice.address)).to.equal(E18(15));
  });
});

describe("TransferWindowModule", function () {
  it("blocks all transfers during an active blackout and allows them once deactivated", async function () {
    const module = await deployModule<TransferWindowModule>("TransferWindowModule");
    const s = await deployFullSuite({
      complianceModules: [await module.getAddress()],
      complianceSettings: [module.interface.encodeFunctionData("deactivateBlackout", [])],
    });

    await s.verifyInvestor(s.alice, USA);
    await s.verifyInvestor(s.bob, USA);
    await s.token.connect(s.agent).unpause();
    await s.token.connect(s.agent).mint(s.alice.address, E18(100));

    const now = Math.floor(Date.now() / 1000);
    await s.mc.connect(s.deployer).callModuleFunction(
      module.interface.encodeFunctionData("activateBlackout", [now - 10, now + 3600]),
      await module.getAddress(),
    );
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.be.reverted;

    await s.mc.connect(s.deployer).callModuleFunction(
      module.interface.encodeFunctionData("deactivateBlackout", []),
      await module.getAddress(),
    );
    await s.token.connect(s.alice).transfer(s.bob.address, E18(1));
    expect(await s.token.balanceOf(s.bob.address)).to.equal(E18(1));
  });
});

describe("SupplyLimitModule", function () {
  it("blocks minting beyond the configured supply cap", async function () {
    const module = await deployModule<SupplyLimitModule>("SupplyLimitModule");
    const s = await deployFullSuite({
      complianceModules: [await module.getAddress()],
      complianceSettings: [module.interface.encodeFunctionData("setSupplyLimit", [E18(100)])],
    });

    await s.verifyInvestor(s.alice, USA);
    await s.token.connect(s.agent).unpause();

    await s.token.connect(s.agent).mint(s.alice.address, E18(100));
    await expect(s.token.connect(s.agent).mint(s.alice.address, E18(1))).to.be.revertedWith(
      "Compliance not followed",
    );
  });
});

describe("MaxBalanceModule", function () {
  it("blocks a transfer that would push the recipient identity's balance over the cap", async function () {
    const module = await deployModule<MaxBalanceModule>("MaxBalanceModule");
    const s = await deployFullSuite({
      complianceModules: [await module.getAddress()],
      complianceSettings: [module.interface.encodeFunctionData("setMaxBalance", [E18(50)])],
    });

    await s.verifyInvestor(s.alice, USA);
    await s.verifyInvestor(s.bob, USA);
    await s.token.connect(s.agent).unpause();
    // Both initial mints stay within the cap themselves — the module applies
    // to every recipient, including the initial funding mints.
    await s.token.connect(s.agent).mint(s.alice.address, E18(50));
    await s.token.connect(s.agent).mint(s.bob.address, E18(40));

    await s.token.connect(s.alice).transfer(s.bob.address, E18(10)); // bob -> exactly 50, at cap
    expect(await s.token.balanceOf(s.bob.address)).to.equal(E18(50));
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.be.reverted; // would push bob to 51
  });
});

describe("DayMonthLimitsModule", function () {
  it("blocks a transfer that exceeds the rolling daily limit", async function () {
    const module = await deployModule<DayMonthLimitsModule>("DayMonthLimitsModule");
    const s = await deployFullSuite({
      complianceModules: [await module.getAddress()],
      complianceSettings: [module.interface.encodeFunctionData("setDailyLimit", [E18(50)])],
    });

    await s.verifyInvestor(s.alice, USA);
    await s.verifyInvestor(s.bob, USA);
    await s.token.connect(s.agent).unpause();
    await s.token.connect(s.agent).mint(s.alice.address, E18(100));

    await s.token.connect(s.alice).transfer(s.bob.address, E18(30));
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(30))).to.be.reverted; // 60 > 50 daily cap
    await s.token.connect(s.alice).transfer(s.bob.address, E18(20)); // 30 + 20 = 50, exactly at cap
    expect(await s.token.balanceOf(s.bob.address)).to.equal(E18(50));
  });
});

describe("ExchangeMonthlyLimitsModule", function () {
  it("caps monthly deposits from one investor into a registered exchange identity", async function () {
    const module = await deployModule<ExchangeMonthlyLimitsModule>("ExchangeMonthlyLimitsModule");
    const s = await deployFullSuite({ complianceModules: [await module.getAddress()], complianceSettings: [] });

    await s.verifyInvestor(s.alice, USA);
    const exchangeIdentity = await s.verifyInvestor(s.bob, USA);
    await s.token.connect(s.agent).unpause();
    await s.token.connect(s.agent).mint(s.alice.address, E18(1000));

    await s.mc.connect(s.deployer).callModuleFunction(
      module.interface.encodeFunctionData("addExchangeID", [await exchangeIdentity.getAddress()]),
      await module.getAddress(),
    );
    await s.mc.connect(s.deployer).callModuleFunction(
      module.interface.encodeFunctionData("setExchangeMonthlyLimit", [
        await exchangeIdentity.getAddress(),
        E18(100),
      ]),
      await module.getAddress(),
    );

    await s.token.connect(s.alice).transfer(s.bob.address, E18(60));
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(60))).to.be.reverted; // 120 > 100
    await s.token.connect(s.alice).transfer(s.bob.address, E18(40)); // 60 + 40 = 100, exactly at cap
    expect(await s.token.balanceOf(s.bob.address)).to.equal(E18(100));
  });
});

describe("TransferFeeModule", function () {
  it("deducts the fee from the recipient and credits the collector", async function () {
    const module = await deployModule<TransferFeeModule>("TransferFeeModule");
    // The module collects via forcedTransfer, so it must be a token agent
    // before it may be bound — deploy without it, then grant and bind.
    const s = await deployFullSuite();
    await s.token.connect(s.deployer).addAgent(await module.getAddress());
    expect(await s.token.isAgent(await module.getAddress())).to.equal(true);
    expect(await module.canComplianceBind(await s.mc.getAddress())).to.equal(true);
    await s.mc.connect(s.deployer).addModule(await module.getAddress());

    await s.verifyInvestor(s.alice, USA);
    await s.verifyInvestor(s.bob, USA);
    // The collector receives tokens, so it needs a verified identity like any
    // other holder — forcedTransfer enforces isVerified on the recipient.
    await s.verifyInvestor(s.outsider, USA);
    await s.token.connect(s.agent).unpause();
    await s.token.connect(s.agent).mint(s.alice.address, E18(1000));

    await s.mc.connect(s.deployer).callModuleFunction(
      module.interface.encodeFunctionData("setFeeConfig", [250, s.outsider.address]), // 2.5%
      await module.getAddress(),
    );

    const tx = await s.token.connect(s.alice).transfer(s.bob.address, E18(100));
    const receipt = await tx.wait();
    const feeEvent = receipt!.logs
      .map((l) => {
        try {
          return module.interface.parseLog(l as unknown as { topics: string[]; data: string });
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "FeeCharged");

    expect(feeEvent).to.not.equal(undefined);
    expect(feeEvent!.args.feeAmount).to.equal(E18(2.5));
    // The fee is now really moved: recipient keeps 97.5, collector gets 2.5.
    expect(await s.token.balanceOf(s.bob.address)).to.equal(E18(97.5));
    expect(await s.token.balanceOf(s.outsider.address)).to.equal(E18(2.5));
  });
});

describe("SenderWhitelistModule", function () {
  async function setup() {
    const module = await deployModule<SenderWhitelistModule>("SenderWhitelistModule");
    const s = await deployFullSuite({
      complianceModules: [await module.getAddress()],
      complianceSettings: [],
    });
    await s.verifyInvestor(s.alice, USA);
    await s.verifyInvestor(s.bob, USA);
    await s.token.connect(s.agent).unpause();
    await s.token.connect(s.agent).mint(s.alice.address, E18(100));
    const configure = (fn: string, args: unknown[]) =>
      s.mc
        .connect(s.deployer)
        .callModuleFunction(module.interface.encodeFunctionData(fn as never, args as never), module.getAddress());
    return { module, s, configure };
  }

  it("imposes no restriction while the whitelist is empty (bound-but-unconfigured is safe)", async function () {
    const { module, s } = await setup();
    expect(await module.whitelistedSenderCount(await s.mc.getAddress())).to.equal(0n);
    // Previously this reverted, bricking transfers for a merely-bound module.
    await s.token.connect(s.alice).transfer(s.bob.address, E18(1));
    expect(await s.token.balanceOf(s.bob.address)).to.equal(E18(1));
  });

  it("restricts to whitelisted senders once at least one is configured", async function () {
    const { module, s, configure } = await setup();
    await configure("addSender", [s.bob.address]); // bob allowed, alice not
    expect(await module.whitelistedSenderCount(await s.mc.getAddress())).to.equal(1n);

    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.be.reverted;

    await configure("addSender", [s.alice.address]);
    await s.token.connect(s.alice).transfer(s.bob.address, E18(1));
    expect(await s.token.balanceOf(s.bob.address)).to.equal(E18(1));
  });

  it("stays enforced when the last whitelisted sender is removed, until stood down", async function () {
    const { module, s, configure } = await setup();
    await configure("addSender", [s.bob.address]);
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.be.reverted;

    // An emptied allowlist must mean "nobody may send", not "everybody may".
    await configure("removeSender", [s.bob.address]);
    expect(await module.whitelistedSenderCount(await s.mc.getAddress())).to.equal(0n);
    await expect(s.token.connect(s.alice).transfer(s.bob.address, E18(1))).to.be.reverted;

    // Lifting the restriction is an explicit act.
    await configure("deactivateRestriction", []);
    await s.token.connect(s.alice).transfer(s.bob.address, E18(1));
    expect(await s.token.balanceOf(s.bob.address)).to.equal(E18(1));
  });

  it("keeps the counter accurate across duplicate adds and redundant removes", async function () {
    const { module, s, configure } = await setup();
    const mcAddr = await s.mc.getAddress();

    await configure("addSender", [s.alice.address]);
    await configure("addSender", [s.alice.address]); // duplicate must not double-count
    expect(await module.whitelistedSenderCount(mcAddr)).to.equal(1n);

    await configure("removeSender", [s.charlie.address]); // never added — must not underflow
    expect(await module.whitelistedSenderCount(mcAddr)).to.equal(1n);

    await configure("batchAddSenders", [[s.alice.address, s.bob.address, s.charlie.address]]);
    expect(await module.whitelistedSenderCount(mcAddr)).to.equal(3n); // alice not recounted

    await configure("removeSender", [s.alice.address]);
    expect(await module.whitelistedSenderCount(mcAddr)).to.equal(2n);
    expect(await module.isSenderWhitelisted(mcAddr, s.alice.address)).to.equal(false);
  });
});
