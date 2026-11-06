import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/services/jwt.service';
import { UserRole } from '../../auth/entities/user.entity';
import { IdentityDeploymentService } from '../services/identity-deployment.service';
import { ClaimIssuanceService } from '../services/claim-issuance.service';
import { IdentityRegistryService } from '../services/identity-registry.service';
import { DeployIdentityDto, RegisterInTokenDto, IssueClaimsDto } from '../dto/identity.dto';

const AGENT_ROLES = [UserRole.ISSUER, UserRole.COMPLIANCE_OFFICER, UserRole.TRANSFER_AGENT];

@UseGuards(JwtAuthGuard)
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identityDeployment: IdentityDeploymentService,
    private readonly claimIssuance: ClaimIssuanceService,
    private readonly identityRegistry: IdentityRegistryService,
  ) {}

  @Get('me')
  async getMyIdentity(@CurrentUser() user: JwtPayload) {
    const identity = await this.identityDeployment.getIdentityByUser(user.sub);
    return {
      deployed: !!identity,
      identity: identity ?? null,
    };
  }

  @Post('deploy')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async deployIdentity(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DeployIdentityDto,
  ) {
    const identity = await this.identityDeployment.getOrDeployIdentity(
      user.sub,
      dto.wallet_address,
    );
    return { identity };
  }

  @Post('claims/issue')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async issueClaims(
    @CurrentUser() user: JwtPayload,
    @Body() dto: IssueClaimsDto,
  ) {
    const results = await this.claimIssuance.issueKycClaims(user.sub, '', {
      countryCode: dto.country_code,
      isAccredited: dto.is_accredited,
    });
    return { claims: results };
  }

  @Post('register-in-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(...AGENT_ROLES)
  async registerInToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterInTokenDto,
  ) {
    const result = await this.identityRegistry.registerInToken(
      user.sub,
      '',
      dto.token_id,
      dto.identity_registry_address,
      dto.country_code ?? 0,
    );
    return result;
  }

  @Get(':tokenId/status')
  async getTokenIdentityStatus(
    @CurrentUser() user: JwtPayload,
    @Param('tokenId') tokenId: string,
  ) {
    const identity = await this.identityDeployment.getIdentityByUser(user.sub);
    const isRegistered = identity?.registeredTokenIds.includes(tokenId) ?? false;

    return {
      userId: user.sub,
      tokenId,
      identityDeployed: !!identity,
      identityAddress: identity?.identityContractAddress ?? null,
      registeredInToken: isRegistered,
      claimsIssued: identity?.claimTopicsIssued ?? {},
    };
  }
}
