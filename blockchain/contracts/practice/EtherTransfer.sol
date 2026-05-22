// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Receive ETH
contract ReceiveEther {

    event ReceivedEther(address indexed sender, uint256 amount);

    receive() external payable {
        emit ReceivedEther(msg.sender, msg.value);
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}

// Send ETH — three methods compared
contract SendEther {

    // transfer: fixed 2300 gas, reverts on failure (simplest)
    function sendViaTransfer(address payable _to) public payable {
        _to.transfer(msg.value);
    }

    // send: fixed 2300 gas, returns bool (check manually)
    function sendViaSend(address payable _to) public payable {
        bool sent = _to.send(msg.value);
        require(sent, "Failed to send Ether");
    }

    // call: forwards all gas, most flexible — recommended for production
    function sendViaCall(address payable _to) public payable {
        (bool sent, ) = _to.call{value: msg.value}("");
        require(sent, "Failed to send Ether");
    }
}
