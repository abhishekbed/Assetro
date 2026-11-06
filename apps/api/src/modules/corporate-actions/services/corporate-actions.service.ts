import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers, formatUnits } from 'ethers';
import { ConfigService } from '@nestjs/config';
import {
  CorporateAction,
  CorporateActionType,
  CorporateActionStatus,
} from '../entities/corporate-action.entity';
import {
  CorporateActionVote,
  VoteType,
  SellRequestStatus,
} from '../entities/corporate-action-vote.entity';
import { CapTable } from '../../tokens/entities/cap-table.entity';
import { Token } from '../../tokens/entities/token.entity';

const TOKEN_ABI = [
  'function mint(address _to, uint256 _amount) external',
  'function batchMint(address[] calldata _toList, uint256[] calldata _amounts) external',
  'function decimals() external view returns (uint8)',
  'function totalSupply() external view returns (uint256)',
];

export interface CreateCorporateActionDto {
  token_id: string;
  type: CorporateActionType;
  title: string;
  description?: string;
  record_date: string;
  payment_date?: string;
  parameters?: Record<string, unknown>;
  tenant_id?: string;
  created_by?: string;
}

@Injectable()
export class CorporateActionsService {
  private readonly logger = new Logger(CorporateActionsService.name);

  constructor(
    @InjectRepository(CorporateAction)
    private readonly actionRepo: Repository<CorporateAction>,
    @InjectRepository(CorporateActionVote)
    private readonly voteRepo: Repository<CorporateActionVote>,
    @InjectRepository(CapTable)
    private readonly capTableRepo: Repository<CapTable>,
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
    private readonly config: ConfigService,
  ) {}

  async findAll(tenantId?: string): Promise<CorporateAction[]> {
    const where = tenantId ? { tenantId } : {};
    return this.actionRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * `ownerTenant` pins the lookup to one tenant (set for issuers); a mismatch
   * is reported as not found so other tenants' action ids are not revealed.
   */
  async findById(id: string, ownerTenant?: string): Promise<CorporateAction> {
    const a = await this.actionRepo.findOne({ where: { id } });
    if (!a || (ownerTenant && a.tenantId !== ownerTenant)) {
      throw new NotFoundException(`Corporate action ${id} not found`);
    }
    return a;
  }

  async create(dto: CreateCorporateActionDto, ownerTenant?: string): Promise<CorporateAction> {
    const token = await this.tokenRepo.findOne({ where: { id: dto.token_id } });
    if (!token || (ownerTenant && token.tenantId !== ownerTenant)) {
      throw new NotFoundException(`Token ${dto.token_id} not found`);
    }

    const action = this.actionRepo.create({
      tokenId: dto.token_id,
      tenantId: dto.tenant_id ?? null,
      type: dto.type,
      title: dto.title,
      description: dto.description ?? null,
      status: CorporateActionStatus.DRAFT,
      recordDate: dto.record_date,
      paymentDate: dto.payment_date ?? null,
      parameters: dto.parameters ?? null,
      createdBy: dto.created_by ?? null,
    });
    return this.actionRepo.save(action);
  }

  async update(id: string, updates: Partial<CreateCorporateActionDto>, ownerTenant?: string): Promise<CorporateAction> {
    const a = await this.findById(id, ownerTenant);
    if (a.status === CorporateActionStatus.COMPLETED || a.status === CorporateActionStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a completed or cancelled action');
    }
    if (updates.title !== undefined) a.title = updates.title;
    if (updates.description !== undefined) a.description = updates.description ?? null;
    if (updates.record_date !== undefined) a.recordDate = updates.record_date;
    if (updates.payment_date !== undefined) a.paymentDate = updates.payment_date ?? null;
    if (updates.parameters !== undefined) a.parameters = { ...a.parameters, ...updates.parameters };
    return this.actionRepo.save(a);
  }

  async activate(id: string, ownerTenant?: string): Promise<CorporateAction> {
    const a = await this.findById(id, ownerTenant);
    a.status = CorporateActionStatus.ACTIVE;
    return this.actionRepo.save(a);
  }

  async cancel(id: string, ownerTenant?: string): Promise<void> {
    const a = await this.findById(id, ownerTenant);
    a.status = CorporateActionStatus.CANCELLED;
    await this.actionRepo.save(a);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EXECUTE
  // ─────────────────────────────────────────────────────────────────────────────

  async execute(id: string, executedBy?: string, ownerTenant?: string): Promise<Record<string, unknown>> {
    const action = await this.findById(id, ownerTenant);
    const token = await this.tokenRepo.findOne({ where: { id: action.tokenId } });
    if (!token) throw new NotFoundException(`Token ${action.tokenId} not found`);

    if (action.status === CorporateActionStatus.COMPLETED) {
      throw new BadRequestException('Action already executed');
    }
    if (action.status === CorporateActionStatus.CANCELLED) {
      throw new BadRequestException('Cannot execute a cancelled action');
    }

    // Claim the action atomically: a second concurrent execute (double click,
    // retry) finds it already EXECUTING and must not run the mint again.
    const previousStatus = action.status;
    const claimed = await this.actionRepo
      .createQueryBuilder()
      .update(CorporateAction)
      .set({ status: CorporateActionStatus.EXECUTING })
      .where('id = :id AND status != :executing AND status != :completed AND status != :cancelled', {
        id,
        executing: CorporateActionStatus.EXECUTING,
        completed: CorporateActionStatus.COMPLETED,
        cancelled: CorporateActionStatus.CANCELLED,
      })
      .execute();
    if (!claimed.affected) {
      throw new BadRequestException('Action is already being executed or has finished');
    }
    action.status = CorporateActionStatus.EXECUTING;

    try {
      let result: Record<string, unknown>;
      switch (action.type) {
        case CorporateActionType.DIVIDEND:
          result = await this.executeDividend(action, token);
          break;
        case CorporateActionType.STOCK_SPLIT:
          result = await this.executeStockSplit(action, token);
          break;
        case CorporateActionType.VOTING:
          result = await this.finalizeVoting(action);
          break;
        case CorporateActionType.BUYBACK:
          result = await this.executeBuyback(action, token);
          break;
        case CorporateActionType.ANNOUNCEMENT:
          result = { message: 'Announcement published' };
          break;
        default:
          throw new BadRequestException(`Unknown action type: ${action.type}`);
      }

      action.status = CorporateActionStatus.COMPLETED;
      action.executedAt = new Date();
      action.executedBy = executedBy ?? null;
      action.executionResult = result;
      await this.actionRepo.save(action);
      return result;
    } catch (err) {
      action.status = previousStatus === CorporateActionStatus.DRAFT
        ? CorporateActionStatus.DRAFT
        : CorporateActionStatus.ACTIVE;
      await this.actionRepo.save(action);
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DIVIDEND
  // ─────────────────────────────────────────────────────────────────────────────

  private async executeDividend(action: CorporateAction, token: Token): Promise<Record<string, unknown>> {
    const params = (action.parameters ?? {}) as Record<string, unknown>;
    const amountPerToken = Number(params.amount_per_token ?? 0);
    const payoutType = (params.payout_type as string) ?? 'fiat';

    if (!amountPerToken || amountPerToken <= 0) {
      throw new BadRequestException('amount_per_token must be > 0 for dividend');
    }

    const holders = await this.capTableRepo.find({ where: { tokenId: token.id } });
    if (holders.length === 0) throw new BadRequestException('No holders in cap table');

    if (payoutType === 'fiat') {
      // Generate payout list — no on-chain action, issuer handles wire transfers
      // cap_table.balance is in base units (wei) — convert to whole tokens first.
      const decimals = token.decimals ?? 18;
      const payouts = holders.map(h => {
        const tokens = formatUnits(BigInt(h.balance || '0'), decimals);
        return {
          wallet: h.walletAddress,
          userId: h.userId,
          balance: tokens,
          payoutAmount: (Number(tokens) * amountPerToken).toFixed(2),
        };
      });
      const totalPayout = payouts.reduce((s, p) => s + parseFloat(p.payoutAmount), 0);
      return { type: 'fiat', payouts, totalPayout, currency: 'USD', exportReady: true };
    }

    // Token payout via batch mint
    const result = await this.batchMintToHolders(token, holders, amountPerToken, action.id);
    return { type: 'token', ...result };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STOCK SPLIT
  // ─────────────────────────────────────────────────────────────────────────────

  private async executeStockSplit(action: CorporateAction, token: Token): Promise<Record<string, unknown>> {
    const params = (action.parameters ?? {}) as Record<string, unknown>;
    const numerator = Number(params.ratio_numerator ?? 2);
    const denominator = Number(params.ratio_denominator ?? 1);

    if (numerator <= denominator) {
      throw new BadRequestException(`Split ratio ${numerator}:${denominator} is not an increase. Use numerator > denominator.`);
    }

    const holders = await this.capTableRepo.find({ where: { tokenId: token.id } });
    if (holders.length === 0) throw new BadRequestException('No holders in cap table');

    // Each holder receives (numerator/denominator - 1) * balance new tokens
    const multiplier = (numerator - denominator) / denominator;
    const result = await this.batchMintToHolders(token, holders, multiplier, action.id);
    return { type: 'stock_split', ratio: `${numerator}:${denominator}`, ...result };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Shared batch-mint helper
  // ─────────────────────────────────────────────────────────────────────────────

  private async batchMintToHolders(
    token: Token,
    holders: CapTable[],
    multiplierOrAmountPerUnit: number,
    actionId: string,
  ): Promise<Record<string, unknown>> {
    const mode = this.config.get<string>('BLOCKCHAIN_MODE', 'local');
    const decimals = token.decimals ?? 18;

    const entries = holders.map(h => {
      const holderBalance = Number(h.balance) / 10 ** decimals;
      const mintAmount = holderBalance * multiplierOrAmountPerUnit;
      return { address: h.walletAddress, amount: mintAmount };
    }).filter(e => e.amount > 0);

    if (entries.length === 0) return { txHash: null, count: 0, mode };

    if (mode !== 'live') {
      this.logger.warn(`[CA][${actionId}] LOCAL mode — simulating batch mint for ${entries.length} holders`);
      return {
        txHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        count: entries.length,
        mode: 'local',
      };
    }

    const rpcUrl = this.config.get<string>('SEPOLIA_RPC_URL');
    const pk = this.config.get<string>('DEPLOYER_PRIVATE_KEY');
    if (!rpcUrl || !pk) throw new BadRequestException('SEPOLIA_RPC_URL or DEPLOYER_PRIVATE_KEY not configured');
    if (!token.tokenAddress) throw new BadRequestException('Token not deployed');

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    const signer = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
    const contract = new ethers.Contract(token.tokenAddress, TOKEN_ABI, signer);

    const addresses = entries.map(e => e.address);
    const amounts = entries.map(e => ethers.parseUnits(e.amount.toFixed(decimals).replace(/\.?0+$/, '') || '0', decimals));

    const tx = await contract.batchMint(addresses, amounts);
    const receipt = await tx.wait() as ethers.TransactionReceipt;

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      count: entries.length,
      mode: 'live',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VOTING
  // ─────────────────────────────────────────────────────────────────────────────

  async castVote(
    actionId: string,
    investorId: string,
    investorAddress: string,
    option: string,
    weight: string,
  ): Promise<CorporateActionVote> {
    const action = await this.findById(actionId);
    if (action.type !== CorporateActionType.VOTING) {
      throw new BadRequestException('This action is not a voting action');
    }
    if (action.status !== CorporateActionStatus.ACTIVE) {
      throw new BadRequestException('Voting is not open');
    }

    // Upsert vote
    const allowedOptions = ((action.parameters as Record<string, unknown> | null)?.options as string[] | undefined) ?? [];
    if (allowedOptions.length > 0 && !allowedOptions.includes(option)) {
      throw new BadRequestException(`Invalid option. Choose one of: ${allowedOptions.join(', ')}`);
    }

    // Weight and address come from the investor's recorded holdings, never from
    // the request, so a voter cannot choose their own voting power.
    const holdings = await this.capTableRepo.find({ where: { tokenId: action.tokenId, userId: investorId } });
    const holderWeight = holdings.reduce((sum, h) => sum + BigInt(h.balance || '0'), BigInt(0));
    if (holderWeight <= BigInt(0)) {
      throw new BadRequestException('You must hold this token to vote');
    }
    weight = holderWeight.toString();
    investorAddress = holdings[0].walletAddress || investorAddress;

    let vote = await this.voteRepo.findOne({ where: { actionId, investorId } });
    if (vote) {
      vote.option = option;
      vote.weight = weight;
    } else {
      vote = this.voteRepo.create({
        actionId,
        investorId,
        investorAddress,
        type: VoteType.VOTE,
        option,
        weight,
      });
    }
    return this.voteRepo.save(vote);
  }

  async getVotingResults(actionId: string): Promise<Record<string, unknown>> {
    const action = await this.findById(actionId);
    const votes = await this.voteRepo.find({ where: { actionId, type: VoteType.VOTE } });

    const options = ((action.parameters as Record<string, unknown>)?.options as string[]) ?? [];
    const tally: Record<string, bigint> = {};
    for (const opt of options) tally[opt] = BigInt(0);

    let totalWeight = BigInt(0);
    for (const v of votes) {
      const w = BigInt(v.weight ?? '0');
      tally[v.option ?? ''] = (tally[v.option ?? ''] ?? BigInt(0)) + w;
      totalWeight += w;
    }

    const results = options.map(opt => ({
      option: opt,
      votes: votes.filter(v => v.option === opt).length,
      weight: tally[opt]?.toString() ?? '0',
      pct: totalWeight > BigInt(0) ? Number((tally[opt] ?? BigInt(0)) * BigInt(10000) / totalWeight) / 100 : 0,
    }));

    return {
      totalVoters: votes.length,
      totalWeight: totalWeight.toString(),
      results,
    };
  }

  private async finalizeVoting(action: CorporateAction): Promise<Record<string, unknown>> {
    const results = await this.getVotingResults(action.id);
    return { ...results, finalizedAt: new Date().toISOString() };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUYBACK
  // ─────────────────────────────────────────────────────────────────────────────

  async submitSellRequest(
    actionId: string,
    investorId: string,
    investorAddress: string,
    tokenAmount: string,
  ): Promise<CorporateActionVote> {
    const action = await this.findById(actionId);
    if (action.type !== CorporateActionType.BUYBACK) {
      throw new BadRequestException('This action is not a buyback');
    }
    if (action.status !== CorporateActionStatus.ACTIVE) {
      throw new BadRequestException('Buyback is not open for submissions');
    }

    const existing = await this.voteRepo.findOne({ where: { actionId, investorId } });
    if (existing) throw new BadRequestException('You have already submitted a sell request');

    const requested = Number(tokenAmount);
    if (!Number.isFinite(requested) || requested <= 0) {
      throw new BadRequestException('token_amount must be a positive number');
    }
    const holdings = await this.capTableRepo.find({ where: { tokenId: action.tokenId, userId: investorId } });
    if (holdings.length === 0) throw new BadRequestException('You must hold this token to sell it back');
    const token = await this.tokenRepo.findOne({ where: { id: action.tokenId } });
    const held = holdings.reduce((sum, h) => sum + Number(formatUnits(BigInt(h.balance || '0'), token?.decimals ?? 18)), 0);
    if (requested > held) {
      throw new BadRequestException(`You only hold ${held} tokens`);
    }
    investorAddress = holdings[0].walletAddress || investorAddress;

    const request = this.voteRepo.create({
      actionId,
      investorId,
      investorAddress,
      type: VoteType.SELL,
      tokenAmount,
      sellStatus: SellRequestStatus.PENDING,
    });
    return this.voteRepo.save(request);
  }

  async getSellRequests(actionId: string): Promise<CorporateActionVote[]> {
    return this.voteRepo.find({
      where: { actionId, type: VoteType.SELL },
      order: { createdAt: 'ASC' },
    });
  }

  async acceptSellRequest(requestId: string, actionId?: string, ownerTenant?: string): Promise<CorporateActionVote> {
    const req = await this.voteRepo.findOne({ where: { id: requestId } });
    if (!req || (actionId && req.actionId !== actionId)) throw new NotFoundException('Sell request not found');
    await this.findById(req.actionId, ownerTenant);
    req.sellStatus = SellRequestStatus.ACCEPTED;
    return this.voteRepo.save(req);
  }

  async rejectSellRequest(requestId: string, actionId?: string, ownerTenant?: string): Promise<CorporateActionVote> {
    const req = await this.voteRepo.findOne({ where: { id: requestId } });
    if (!req || (actionId && req.actionId !== actionId)) throw new NotFoundException('Sell request not found');
    await this.findById(req.actionId, ownerTenant);
    req.sellStatus = SellRequestStatus.REJECTED;
    return this.voteRepo.save(req);
  }

  private async executeBuyback(action: CorporateAction, _token: Token): Promise<Record<string, unknown>> {
    const requests = await this.getSellRequests(action.id);
    const accepted = requests.filter(r => r.sellStatus === SellRequestStatus.ACCEPTED);
    const totalTokens = accepted.reduce((s, r) => s + parseFloat(r.tokenAmount ?? '0'), 0);
    const params = (action.parameters ?? {}) as Record<string, unknown>;
    const pricePerToken = Number(params.price_per_token ?? 0);
    return {
      acceptedRequests: accepted.length,
      totalTokensBoughtBack: totalTokens,
      totalFiatOwed: (totalTokens * pricePerToken).toFixed(2),
      currency: 'USD',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Dividend CSV export
  // ─────────────────────────────────────────────────────────────────────────────

  async exportDividendCsv(actionId: string, ownerTenant?: string): Promise<string> {
    const action = await this.findById(actionId, ownerTenant);
    if (action.type !== CorporateActionType.DIVIDEND) throw new BadRequestException('Not a dividend action');

    const result = action.executionResult as Record<string, unknown> | null;
    const payouts = (result?.payouts as Array<Record<string, string>> | null) ?? [];

    const rows = [
      'Wallet,User ID,Token Balance,Dividend Amount (USD)',
      ...payouts.map(p => `${p.wallet},${p.userId ?? ''},${p.balance},${p.payoutAmount}`),
    ];
    return rows.join('\n');
  }
}
