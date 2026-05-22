// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DataType {

    bool public isActive = true;
    uint256 public studentId = 123456;
    int256 public accountBalance = -100;
    address public walletAddress = 0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2;

    function toggleActive() public {
        isActive = !isActive;
    }

    function incrementStudentId() public {
        studentId += 100;
    }

    function viewData() public view returns (bool, uint256, int256, address) {
        return (isActive, studentId, accountBalance, walletAddress);
    }
}
