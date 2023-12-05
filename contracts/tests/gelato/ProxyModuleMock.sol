// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.16;

import { IProxyModule } from "../../gelato/Types.sol";

/**
 * @title Mock for the Gelato OpsProxyFactory contract
 */
contract ProxyModuleMock is IProxyModule {
    address internal opsProxyFactoryAddress;

    constructor(address _opsProxyFactoryAddress) {
        opsProxyFactoryAddress = _opsProxyFactoryAddress;
    }

    function opsProxyFactory() external view returns (address) {
        return opsProxyFactoryAddress;
    }
}
