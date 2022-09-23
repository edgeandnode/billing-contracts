// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

interface IBilling {
    /**
     * @dev Set or unset an address as an allowed Collector
     * @param _collector  Collector address
     * @param _enabled True to set the _collector address as a Collector, false to remove it
     */
    function setCollector(address _collector, bool _enabled) external; // onlyGovernor

    /**
     * @dev Sets the L2 token gateway address
     * @param _l2TokenGateway New address for the L2 token gateway
     */
    function setL2TokenGateway(address _l2TokenGateway) external;

    /**
     * @dev Add tokens into the billing contract
     * @param _amount  Amount of tokens to add
     */
    function add(uint256 _amount) external;

    /**
     * @dev Add tokens into the billing contract for any user
     * @param _to  Address that tokens are being added to
     * @param _amount  Amount of tokens to add
     */
    function addTo(address _to, uint256 _amount) external;

    /**
     * @dev Add tokens into the billing contract for any user, from L1
     * This can only be called from L2GraphTokenGateway.finalizeInboundTransfer.
     * @param _user  Address that tokens are being added to
     * @param _amount  Amount of tokens to add
     */
    function addFromL1(address _user, uint256 _amount) external;

    /**
     * @dev Add tokens into the billing contract in bulk
     * Ensure graphToken.approve() is called on the billing contract first
     * @param _to  Array of addresses where to add tokens
     * @param _amount  Array of amount of tokens to add to each account
     */
    function addToMany(address[] calldata _to, uint256[] calldata _amount) external;

    /**
     * @dev Remove tokens from the billing contract
     * @param _to  Address that tokens are being removed from
     * @param _amount  Amount of tokens to remove
     */
    function remove(address _to, uint256 _amount) external;

    /**
     * @dev Collector pulls tokens from the billing contract
     * @param _user  Address that tokens are being pulled from
     * @param _amount  Amount of tokens to pull
     * @param _to Destination to send pulled tokens
     */
    function pull(
        address _user,
        uint256 _amount,
        address _to
    ) external;

    /**
     * @dev Collector pulls tokens from many users in the billing contract
     * @param _users  Addresses that tokens are being pulled from
     * @param _amounts  Amounts of tokens to pull from each user
     * @param _to Destination to send pulled tokens
     */
    function pullMany(
        address[] calldata _users,
        uint256[] calldata _amounts,
        address _to
    ) external;
}
