// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "./ITREXGateway.sol";
import "../roles/AgentRole.sol";
import "../token/IToken.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

error ZeroAddress();

error PublicDeploymentAlreadyEnabled();

error PublicDeploymentAlreadyDisabled();

error DeploymentFeesAlreadyEnabled();

error DeploymentFeesAlreadyDisabled();

error DeployerAlreadyExists(address deployer);

error DeployerDoesNotExist(address deployer);

error PublicDeploymentsNotAllowed();

error PublicCannotDeployOnBehalf();

error DiscountOutOfRange();

error OnlyAdminCall();

error BatchMaxLengthExceeded(uint16 lengthLimit);

error IRSNotRegistered(address irs);

error IRSAlreadyRegistered(address irs);

error IRSNotOwnedByFactory(address irs);

error OnlyIRSOwnerCall(address irs);

error IRSUsageNotAuthorized(address irs, address tokenOwner);

error IRSUsageAlreadyAuthorized(address irs, address tokenOwner);

contract TREXGateway is ITREXGateway, AgentRole {
    address private _factory;

    bool private _publicDeploymentStatus;

    Fee private _deploymentFee;

    bool private _deploymentFeeEnabled;

    mapping(address => bool) private _deployers;

    mapping(address => uint16) private _feeDiscount;

    mapping(address => address) private _irsOwner;

    mapping(address => mapping(address => bool)) private _irsAuthorizedUsers;

    constructor(address factory, bool publicDeploymentStatus) {
        _factory = factory;
        _publicDeploymentStatus = publicDeploymentStatus;
        emit FactorySet(factory);
        emit PublicDeploymentStatusSet(publicDeploymentStatus);
    }

    function setFactory(address factory) external override onlyOwner {
        if (factory == address(0)) {
            revert ZeroAddress();
        }
        _factory = factory;
        emit FactorySet(factory);
    }

    function setPublicDeploymentStatus(bool _isEnabled) external override onlyOwner {
        if (_isEnabled == _publicDeploymentStatus && _isEnabled == true) {
            revert PublicDeploymentAlreadyEnabled();
        }
        if (_isEnabled == _publicDeploymentStatus && _isEnabled == false) {
            revert PublicDeploymentAlreadyDisabled();
        }
        _publicDeploymentStatus = _isEnabled;
        emit PublicDeploymentStatusSet(_isEnabled);
    }

    function transferFactoryOwnership(address _newOwner) external override onlyOwner {
        Ownable(_factory).transferOwnership(_newOwner);
    }

    function enableDeploymentFee(bool _isEnabled) external override onlyOwner {
        if (_isEnabled == _deploymentFeeEnabled && _isEnabled == true) {
            revert DeploymentFeesAlreadyEnabled();
        }
        if (_isEnabled == _deploymentFeeEnabled && _isEnabled == false) {
            revert DeploymentFeesAlreadyDisabled();
        }
        _deploymentFeeEnabled = _isEnabled;
        emit DeploymentFeeEnabled(_isEnabled);
    }

    function setDeploymentFee(uint256 _fee, address _feeToken, address _feeCollector) external override onlyOwner {
        if (_feeToken == address(0) || _feeCollector == address(0)) {
            revert ZeroAddress();
        }
        _deploymentFee.fee = _fee;
        _deploymentFee.feeToken = _feeToken;
        _deploymentFee.feeCollector = _feeCollector;
        emit DeploymentFeeSet(_fee, _feeToken, _feeCollector);
    }

    function batchAddDeployer(address[] calldata deployers) external override {
        if (!isAgent(msg.sender) && msg.sender != owner()) {
            revert OnlyAdminCall();
        }
        if (deployers.length > 500) {
            revert BatchMaxLengthExceeded(500);
        }
        for (uint256 i = 0; i < deployers.length; i++) {
            if (isDeployer(deployers[i])) {
                revert DeployerAlreadyExists(deployers[i]);
            }
            _deployers[deployers[i]] = true;
            emit DeployerAdded(deployers[i]);
        }
    }

    function addDeployer(address deployer) external override {
        if (!isAgent(msg.sender) && msg.sender != owner()) {
            revert OnlyAdminCall();
        }
        if (isDeployer(deployer)) {
            revert DeployerAlreadyExists(deployer);
        }
        _deployers[deployer] = true;
        emit DeployerAdded(deployer);
    }

    function batchRemoveDeployer(address[] calldata deployers) external override {
        if (!isAgent(msg.sender) && msg.sender != owner()) {
            revert OnlyAdminCall();
        }
        if (deployers.length > 500) {
            revert BatchMaxLengthExceeded(500);
        }
        for (uint256 i = 0; i < deployers.length; i++) {
            if (!isDeployer(deployers[i])) {
                revert DeployerDoesNotExist(deployers[i]);
            }
            delete _deployers[deployers[i]];
            emit DeployerRemoved(deployers[i]);
        }
    }

    function removeDeployer(address deployer) external override {
        if (!isAgent(msg.sender) && msg.sender != owner()) {
            revert OnlyAdminCall();
        }
        if (!isDeployer(deployer)) {
            revert DeployerDoesNotExist(deployer);
        }
        delete _deployers[deployer];
        emit DeployerRemoved(deployer);
    }

    function batchApplyFeeDiscount(address[] calldata deployers, uint16[] calldata discounts) external override {
        if (!isAgent(msg.sender) && msg.sender != owner()) {
            revert OnlyAdminCall();
        }
        if (deployers.length > 500) {
            revert BatchMaxLengthExceeded(500);
        }
        for (uint256 i = 0; i < deployers.length; i++) {
            if (discounts[i] > 10000) {
                revert DiscountOutOfRange();
            }
            _feeDiscount[deployers[i]] = discounts[i];
            emit FeeDiscountApplied(deployers[i], discounts[i]);
        }
    }

    function applyFeeDiscount(address deployer, uint16 discount) external override {
        if (!isAgent(msg.sender) && msg.sender != owner()) {
            revert OnlyAdminCall();
        }
        if (discount > 10000) {
            revert DiscountOutOfRange();
        }
        _feeDiscount[deployer] = discount;
        emit FeeDiscountApplied(deployer, discount);
    }

    function registerIRS(address irs, address irsOwner) external override {
        if (!isAgent(msg.sender) && msg.sender != owner()) {
            revert OnlyAdminCall();
        }
        if (irs == address(0) || irsOwner == address(0)) {
            revert ZeroAddress();
        }
        if (_irsOwner[irs] != address(0)) {
            revert IRSAlreadyRegistered(irs);
        }
        if (Ownable(irs).owner() != _factory) {
            revert IRSNotOwnedByFactory(irs);
        }
        _irsOwner[irs] = irsOwner;
        emit IRSRegistered(irs, irsOwner);
    }

    function transferIRSOwnership(address irs, address newOwner) external override {
        _onlyIRSOwner(irs);
        if (newOwner == address(0)) {
            revert ZeroAddress();
        }
        address previousOwner = _irsOwner[irs];
        _irsOwner[irs] = newOwner;
        emit IRSOwnershipTransferred(irs, previousOwner, newOwner);
    }

    function authorizeIRSUsage(address irs, address tokenOwner) external override {
        _onlyIRSOwner(irs);
        if (tokenOwner == address(0)) {
            revert ZeroAddress();
        }
        if (_irsAuthorizedUsers[irs][tokenOwner]) {
            revert IRSUsageAlreadyAuthorized(irs, tokenOwner);
        }
        _irsAuthorizedUsers[irs][tokenOwner] = true;
        emit IRSUsageAuthorized(irs, tokenOwner);
    }

    function revokeIRSUsage(address irs, address tokenOwner) external override {
        _onlyIRSOwner(irs);
        if (!_irsAuthorizedUsers[irs][tokenOwner]) {
            revert IRSUsageNotAuthorized(irs, tokenOwner);
        }
        delete _irsAuthorizedUsers[irs][tokenOwner];
        emit IRSUsageRevoked(irs, tokenOwner);
    }

    function recoverIRSOwnership(address irs) external override {
        _onlyIRSOwner(irs);
        ITREXFactory(_factory).recoverContractOwnership(irs, msg.sender);
        emit IRSOwnershipRecovered(irs, msg.sender);
    }

    function batchDeployTREXSuite(
        ITREXFactory.TokenDetails[] memory _tokenDetails,
        ITREXFactory.ClaimDetails[] memory _claimDetails
    ) external override {
        if (_tokenDetails.length > 5) {
            revert BatchMaxLengthExceeded(5);
        }
        for (uint256 i = 0; i < _tokenDetails.length; i++) {
            deployTREXSuite(_tokenDetails[i], _claimDetails[i]);
        }
    }

    function getPublicDeploymentStatus() external view override returns (bool) {
        return _publicDeploymentStatus;
    }

    function getFactory() external view override returns (address) {
        return _factory;
    }

    function getDeploymentFee() external view override returns (Fee memory) {
        return _deploymentFee;
    }

    function isDeploymentFeeEnabled() external view override returns (bool) {
        return _deploymentFeeEnabled;
    }

    function getIRSOwner(address irs) external view override returns (address) {
        return _irsOwner[irs];
    }

    function deployTREXSuite(
        ITREXFactory.TokenDetails memory _tokenDetails,
        ITREXFactory.ClaimDetails memory _claimDetails
    ) public override {
        if (_publicDeploymentStatus == false && !isDeployer(msg.sender)) {
            revert PublicDeploymentsNotAllowed();
        }
        if (_publicDeploymentStatus == true && msg.sender != _tokenDetails.owner && !isDeployer(msg.sender)) {
            revert PublicCannotDeployOnBehalf();
        }

        if (_tokenDetails.irs != address(0)) {
            _checkIRSUsage(_tokenDetails.irs, _tokenDetails.owner);
        }
        uint256 feeApplied = 0;
        if (_deploymentFeeEnabled == true) {
            if (_deploymentFee.fee > 0 && _feeDiscount[msg.sender] < 10000) {
                feeApplied = calculateFee(msg.sender);
                IERC20(_deploymentFee.feeToken).transferFrom(msg.sender, _deploymentFee.feeCollector, feeApplied);
            }
        }
        string memory _salt = string(abi.encodePacked(Strings.toHexString(_tokenDetails.owner), _tokenDetails.name));
        ITREXFactory(_factory).deployTREXSuite(_salt, _tokenDetails, _claimDetails);

        if (_tokenDetails.irs == address(0)) {
            _registerDeployedIRS(_salt, _tokenDetails.owner);
        }
        emit GatewaySuiteDeploymentProcessed(msg.sender, _tokenDetails.owner, feeApplied);
    }

    function isDeployer(address deployer) public view override returns (bool) {
        return _deployers[deployer];
    }

    function calculateFee(address deployer) public view override returns (uint256) {
        return _deploymentFee.fee - ((_feeDiscount[deployer] * _deploymentFee.fee) / 10000);
    }

    function isIRSUsageAuthorized(address irs, address tokenOwner) public view override returns (bool) {
        return (_irsOwner[irs] != address(0)) && (_irsOwner[irs] == tokenOwner || _irsAuthorizedUsers[irs][tokenOwner]);
    }

    function _registerDeployedIRS(string memory _salt, address irsOwner) private {
        address token = ITREXFactory(_factory).getToken(_salt);
        address irs = address(IToken(token).identityRegistry().identityStorage());
        _irsOwner[irs] = irsOwner;
        emit IRSRegistered(irs, irsOwner);
    }

    function _checkIRSUsage(address irs, address tokenOwner) private view {
        if (_irsOwner[irs] == address(0)) {
            revert IRSNotRegistered(irs);
        }
        if (!isIRSUsageAuthorized(irs, tokenOwner)) {
            revert IRSUsageNotAuthorized(irs, tokenOwner);
        }
        if (Ownable(irs).owner() != _factory) {
            revert IRSNotOwnedByFactory(irs);
        }
    }

    function _onlyIRSOwner(address irs) private view {
        if (_irsOwner[irs] == address(0) || msg.sender != _irsOwner[irs]) {
            revert OnlyIRSOwnerCall(irs);
        }
    }
}
