import { encodeFunctionData, parseUnits, type Address, type Hex } from 'viem';

/**
 * Builds the `complianceModules[]` / `complianceSettings[]` pair that
 * `deployTREXSuite` takes, from the `compliance_modules` blob stored on a
 * token's metadata at creation time.
 *
 * TREXFactory loops both arrays and, for every index i:
 *   if (!mc.isModuleBound(modules[i])) mc.addModule(modules[i])
 *   if (i < settings.length) mc.callModuleFunction(settings[i], modules[i])
 *
 * That second call fires UNCONDITIONALLY for every index below settings.length
 * — it does not skip empty '0x' calldata. These modules have no fallback
 * function, so a bare '0x' reverts the entire deployment. Every entry pushed
 * here therefore carries a real function call.
 *
 * A module needing two setup calls (DayMonthLimits) is pushed twice: the
 * factory's isModuleBound check skips the duplicate addModule, but still runs
 * callModuleFunction for both entries.
 */

export interface ComplianceModulesMetadata {
  country_restrict?: { enabled?: boolean; restricted_countries?: Array<number | string> };
  max_holders?: { enabled?: boolean; max?: number | string };
  transfer_window?: { enabled?: boolean };
  supply_limit?: { enabled?: boolean; limit?: number | string };
  max_balance?: { enabled?: boolean; max?: number | string };
  day_month_limits?: {
    enabled?: boolean;
    daily_limit?: number | string;
    monthly_limit?: number | string;
  };
  exchange_monthly_limits?: {
    enabled?: boolean;
    exchange_addresses?: string[];
    monthly_limit?: number | string;
  };
}

export const MODULE_ADDRESSES = {
  countryRestrict: (process.env.NEXT_PUBLIC_COUNTRY_RESTRICT_MODULE_ADDRESS ?? '') as Address,
  maxHolders: (process.env.NEXT_PUBLIC_MAX_HOLDER_MODULE_ADDRESS ?? '') as Address,
  transferWindow: (process.env.NEXT_PUBLIC_TRANSFER_WINDOW_MODULE_ADDRESS ?? '') as Address,
  supplyLimit: (process.env.NEXT_PUBLIC_SUPPLY_LIMIT_MODULE_ADDRESS ?? '') as Address,
  maxBalance: (process.env.NEXT_PUBLIC_MAX_BALANCE_MODULE_ADDRESS ?? '') as Address,
  dayMonthLimits: (process.env.NEXT_PUBLIC_DAY_MONTH_LIMITS_MODULE_ADDRESS ?? '') as Address,
  exchangeMonthly: (process.env.NEXT_PUBLIC_EXCHANGE_MONTHLY_LIMITS_MODULE_ADDRESS ?? '') as Address,
  transferFee: (process.env.NEXT_PUBLIC_TRANSFER_FEE_MODULE_ADDRESS ?? '') as Address,
  senderWhitelist: (process.env.NEXT_PUBLIC_SENDER_WHITELIST_MODULE_ADDRESS ?? '') as Address,
} as const;

const abiFor = (name: string, inputs: { name: string; type: string }[]) =>
  [{ name, type: 'function' as const, inputs, outputs: [] }];

/** Amounts are entered as human-readable strings and stored on-chain in base units. */
function toBaseUnits(value: number | string, decimals: number): bigint {
  return parseUnits(String(value).trim(), decimals);
}

export function buildOnchainModuleArrays(
  metadata: ComplianceModulesMetadata | null | undefined,
  decimals = 18,
): { modules: Address[]; settings: Hex[] } {
  const modules: Address[] = [];
  const settings: Hex[] = [];
  if (!metadata) return { modules, settings };

  const push = (addr: Address, calldata: Hex) => {
    // An unconfigured module address would be bound as the zero address and
    // revert the deployment, so skip it rather than ship a broken tx.
    if (!addr || addr.length !== 42) return;
    modules.push(addr);
    settings.push(calldata);
  };

  const m = metadata;

  if (m.country_restrict?.enabled) {
    const codes = (m.country_restrict.restricted_countries ?? [])
      .map(Number)
      .filter((n) => !Number.isNaN(n) && n > 0);
    if (codes.length > 0) {
      push(
        MODULE_ADDRESSES.countryRestrict,
        encodeFunctionData({
          abi: abiFor('batchRestrictCountries', [{ name: '_countries', type: 'uint16[]' }]),
          functionName: 'batchRestrictCountries',
          args: [codes],
        }) as Hex,
      );
    }
  }

  if (m.max_holders?.enabled && Number(m.max_holders.max) > 0) {
    push(
      MODULE_ADDRESSES.maxHolders,
      encodeFunctionData({
        abi: abiFor('setMaxHolders', [{ name: '_max', type: 'uint256' }]),
        functionName: 'setMaxHolders',
        args: [BigInt(Number(m.max_holders.max))],
      }) as Hex,
    );
  }

  // Bound with a harmless no-op; a real blackout is activated later from the
  // compliance page. '0x' here would revert the deployment.
  if (m.transfer_window?.enabled) {
    push(
      MODULE_ADDRESSES.transferWindow,
      encodeFunctionData({
        abi: abiFor('deactivateBlackout', []),
        functionName: 'deactivateBlackout',
        args: [],
      }) as Hex,
    );
  }

  if (m.supply_limit?.enabled && m.supply_limit.limit) {
    push(
      MODULE_ADDRESSES.supplyLimit,
      encodeFunctionData({
        abi: abiFor('setSupplyLimit', [{ name: '_limit', type: 'uint256' }]),
        functionName: 'setSupplyLimit',
        args: [toBaseUnits(m.supply_limit.limit, decimals)],
      }) as Hex,
    );
  }

  if (m.max_balance?.enabled && m.max_balance.max) {
    push(
      MODULE_ADDRESSES.maxBalance,
      encodeFunctionData({
        abi: abiFor('setMaxBalance', [{ name: '_max', type: 'uint256' }]),
        functionName: 'setMaxBalance',
        args: [toBaseUnits(m.max_balance.max, decimals)],
      }) as Hex,
    );
  }

  if (m.day_month_limits?.enabled) {
    if (m.day_month_limits.daily_limit) {
      push(
        MODULE_ADDRESSES.dayMonthLimits,
        encodeFunctionData({
          abi: abiFor('setDailyLimit', [{ name: '_limit', type: 'uint256' }]),
          functionName: 'setDailyLimit',
          args: [toBaseUnits(m.day_month_limits.daily_limit, decimals)],
        }) as Hex,
      );
    }
    if (m.day_month_limits.monthly_limit) {
      push(
        MODULE_ADDRESSES.dayMonthLimits,
        encodeFunctionData({
          abi: abiFor('setMonthlyLimit', [{ name: '_limit', type: 'uint256' }]),
          functionName: 'setMonthlyLimit',
          args: [toBaseUnits(m.day_month_limits.monthly_limit, decimals)],
        }) as Hex,
      );
    }
  }

  // exchange_monthly_limits is deliberately not bound here: the module keys
  // exchanges by their ONCHAINID, and those identities do not exist at deploy
  // time. It is configured from the compliance page once the exchange
  // investors are onboarded.

  return { modules, settings };
}
