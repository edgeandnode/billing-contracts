// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.16;

import { IOpsProxyFactory } from "../gelato/Types.sol";

/**
 * @title Mock for the Gelato OpsProxyFactory contract
 */
contract OpsProxyFactoryMock is IOpsProxyFactory {
    /**
     * @dev Return same address, we don't use dedicated msg sender so we don't really care
     */
    function getProxyOf(address account) external pure returns (address, bool) {
        return (account, true);
    }
}
