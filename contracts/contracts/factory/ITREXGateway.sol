// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "./ITREXFactory.sol";

interface ITREXGateway {
    struct Fee {
        uint256 fee;
        address feeToken;
        address feeCollector;
    }

    event FactorySet(address indexed factory);

    event PublicDeploymentStatusSet(bool indexed publicDeploymentStatus);

    event DeploymentFeeSet(uint256 indexed fee, address indexed feeToken, address indexed feeCollector);

    event DeploymentFeeEnabled(bool indexed isEnabled);

    event DeployerAdded(address indexed deployer);

    event DeployerRemoved(address indexed deployer);

    event FeeDiscountApplied(address indexed deployer, uint16 discount);

    event GatewaySuiteDeploymentProcessed(address indexed requester, address intendedOwner, uint256 feeApplied);

    event IRSRegistered(address indexed irs, address indexed irsOwner);

    event IRSOwnershipTransferred(address indexed irs, address indexed previousOwner, address indexed newOwner);

    event IRSUsageAuthorized(address indexed irs, address indexed tokenOwner);

    event IRSUsageRevoked(address indexed irs, address indexed tokenOwner);

    event IRSOwnershipRecovered(address indexed irs, address indexed newOwner);

    function setFactory(address factory) external;

    function setPublicDeploymentStatus(bool _isEnabled) external;

    function transferFactoryOwnership(address _newOwner) external;

    function enableDeploymentFee(bool _isEnabled) external;

    function setDeploymentFee(uint256 _fee, address _feeToken, address _feeCollector) external;

    function addDeployer(address deployer) external;

    function batchAddDeployer(address[] calldata deployers) external;

    function removeDeployer(address deployer) external;

    function batchRemoveDeployer(address[] calldata deployers) external;

    function applyFeeDiscount(address deployer, uint16 discount) external;

    function batchApplyFeeDiscount(address[] calldata deployers, uint16[] calldata discounts) external;

    function deployTREXSuite(
        ITREXFactory.TokenDetails memory _tokenDetails,
        ITREXFactory.ClaimDetails memory _claimDetails
    ) external;

    function batchDeployTREXSuite(
        ITREXFactory.TokenDetails[] memory _tokenDetails,
        ITREXFactory.ClaimDetails[] memory _claimDetails
    ) external;

    function registerIRS(address irs, address irsOwner) external;

    function transferIRSOwnership(address irs, address newOwner) external;

    function authorizeIRSUsage(address irs, address tokenOwner) external;

    function revokeIRSUsage(address irs, address tokenOwner) external;

    function recoverIRSOwnership(address irs) external;

    function getIRSOwner(address irs) external view returns (address);

    function isIRSUsageAuthorized(address irs, address tokenOwner) external view returns (bool);

    function getPublicDeploymentStatus() external view returns (bool);

    function getFactory() external view returns (address);

    function getDeploymentFee() external view returns (Fee memory);

    function isDeploymentFeeEnabled() external view returns (bool);

    function isDeployer(address deployer) external view returns (bool);

    function calculateFee(address deployer) external view returns (uint256);
}
