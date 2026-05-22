// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Person {

    struct Student {
        string name;
        uint256 age;
        address walletAddress;
    }

    Student public john;

    constructor() {
        john.name = "John Doe";
        john.age = 30;
        john.walletAddress = msg.sender;
    }

    function updateStudentAge(uint256 newAge) public {
        john.age = newAge;
    }

    function getStudentName() public view returns (string memory) {
        return john.name;
    }
}
