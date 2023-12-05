// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.16;

import { IGelato } from "../../gelato/Types.sol";

/**
 * @title Mock for the Gelato main contract
 */
contract GelatoMock is IGelato {
    // We don't care about the feeCollector for this mock
    function feeCollector() external view returns (address) {
        return address(0);
    }
}
