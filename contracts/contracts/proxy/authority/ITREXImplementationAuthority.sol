// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

interface ITREXImplementationAuthority {
    struct TREXContracts {


        address tokenImplementation;

        address ctrImplementation;

        address irImplementation;

        address irsImplementation;

        address tirImplementation;

        address mcImplementation;
    }

    struct Version {


        uint8 major;

        uint8 minor;

        uint8 patch;
    }

    event TREXVersionAdded(Version indexed version, TREXContracts indexed trex);

    event TREXVersionFetched(Version indexed version, TREXContracts indexed trex);

    event VersionUpdated(Version indexed version);

    event ImplementationAuthoritySet(bool referenceStatus, address trexFactory);

    event TREXFactorySet(address indexed trexFactory);

    event IAFactorySet(address indexed iaFactory);

    event ImplementationAuthorityChanged(address indexed _token, address indexed _newImplementationAuthority);

    function fetchVersion(Version calldata _version) external;

    function setTREXFactory(address trexFactory) external;

    function setIAFactory(address iaFactory) external;

    function addTREXVersion(Version calldata _version, TREXContracts calldata _trex) external;

    function addAndUseTREXVersion(Version calldata _version, TREXContracts calldata _trex) external;

    function useTREXVersion(Version calldata _version) external;

    function changeImplementationAuthority(address _token, address _newImplementationAuthority) external;

    function getCurrentVersion() external view returns (Version memory);

    function getContracts(Version calldata _version) external view returns (TREXContracts memory);

    function getTREXFactory() external view returns (address);

    function getTokenImplementation() external view returns (address);

    function getCTRImplementation() external view returns (address);

    function getIRImplementation() external view returns (address);

    function getIRSImplementation() external view returns (address);

    function getTIRImplementation() external view returns (address);

    function getMCImplementation() external view returns (address);

    function isReferenceContract() external view returns (bool);

    function getReferenceContract() external view returns (address);
}
