// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/// @title Graph subscriptions contract.
/// @notice This contract is designed to allow users of the Graph Protocol to pay gateways for their services with limited risk of losing tokens.
/// It also allows registering authorized signers with the gateway that can create subscription tickets on behalf of the user.
/// This contract makes no assumptions about how the subscription rate is interpreted by the
/// gateway.
interface ISubscriptions {
    /// @notice Create a subscription for the sender.
    /// Will override an active subscription if one exists.
    /// @param start Start timestamp for the new subscription.
    /// @param end End timestamp for the new subscription.
    /// @param rate Rate for the new subscription.
    function subscribe(uint64 start, uint64 end, uint128 rate) external;

    /// @notice Remove the sender's subscription. Unlocked tokens will be transfered to the sender.
    function unsubscribe() external;

    /// @notice Collect a subset of the locked tokens held by this contract.
    function collect() external;

    /// @notice Collect a subset of the locked tokens held by this contract.
    /// @param _offset epochs before the current epoch to end collection. This should be zero unless
    /// this call would otherwise be expected to run out of gas.
    function collect(uint256 _offset) external;

    /// @notice Creates a subscription template without requiring funds. Expected to be used with
    /// `fulfil`.
    /// @param start Start timestamp for the pending subscription.
    /// @param end End timestamp for the pending subscription.
    /// @param rate Rate for the pending subscription.
    function setPendingSubscription(uint64 start, uint64 end, uint128 rate) external;

    /// @notice Fulfil method for the payment fulfilment service
    /// @param _to Owner of the new subscription.
    /// @notice Equivalent to calling `subscribe` with the previous `setPendingSubscription`
    /// arguments for the same user.
    function fulfil(address _to, uint256 _amount) external;

    /// @param _signer Address to be authorized to sign messages on the sender's behalf.
    function addAuthorizedSigner(address _signer) external;

    /// @param _signer Address to become unauthorized to sign messages on the sender's behalf.
    function removeAuthorizedSigner(address _signer) external;

    /// @param _user Subscription owner.
    /// @param _signer Address authorized to sign messages on the owners behalf.
    /// @return isAuthorized True if the given signer is set as an authorized signer for the given
    /// user, false otherwise.
    function checkAuthorizedSigner(address _user, address _signer) external view returns (bool);

    /// @param _timestamp Block timestamp, in seconds.
    /// @return epoch Epoch number, rouded up to the next epoch Boundary.
    function timestampToEpoch(uint256 _timestamp) external view returns (uint256);

    /// @return epoch Current epoch number, rouded up to the next epoch Boundary.
    function currentEpoch() external view returns (uint256);

    /// @dev Defined as `rate * max(0, min(now, end) - start)`.
    /// @param _subStart Start timestamp of the active subscription.
    /// @param _subEnd End timestamp of the active subscription.
    /// @param _subRate Active subscription rate.
    /// @return lockedTokens Amount of locked tokens for the given subscription, which are
    /// collectable by the contract owner and are not recoverable by the user.
    function locked(uint64 _subStart, uint64 _subEnd, uint128 _subRate) external view returns (uint128);

    /// @dev Defined as `rate * max(0, min(now, end) - start)`.
    /// @param _user Address of the active subscription owner.
    /// @return lockedTokens Amount of locked tokens for the given subscription, which are
    /// collectable by the contract owner and are not recoverable by the user.
    function locked(address _user) external view returns (uint128);

    /// @dev Defined as `rate * max(0, end - max(now, start))`.
    /// @param _subStart Start timestamp of the active subscription.
    /// @param _subEnd End timestamp of the active subscription.
    /// @param _subRate Active subscription rate.
    /// @return unlockedTokens Amount of unlocked tokens, which are recoverable by the user, and are
    /// not collectable by the contract owner.
    function unlocked(uint64 _subStart, uint64 _subEnd, uint128 _subRate) external view returns (uint128);

    /// @dev Defined as `rate * max(0, end - max(now, start))`.
    /// @param _user Address of the active subscription owner.
    /// @return unlockedTokens Amount of unlocked tokens, which are recoverable by the user, and are
    /// not collectable by the contract owner.
    function unlocked(address _user) external view returns (uint128);
}
