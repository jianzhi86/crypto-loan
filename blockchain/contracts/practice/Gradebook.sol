// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Exercise: Professor gradebook with access control
contract Gradebook {

    struct Student {
        string name;
        uint256 grade;
    }

    mapping(address => Student) public students;
    address public professorAddress;

    modifier onlyProfessor() {
        require(msg.sender == professorAddress, "Unauthorized access");
        _;
    }

    // Deploy with: constructor(0xYourAddress)
    constructor(address _professorAddress) {
        professorAddress = _professorAddress;
    }

    function addStudent(address studentAddress, string memory name) public onlyProfessor {
        students[studentAddress] = Student(name, 0);
    }

    function assignGrade(address studentAddress, uint256 grade) public onlyProfessor {
        require(grade <= 100, "Grade cannot exceed 100");
        students[studentAddress].grade = grade;
    }

    function getStudentInfo(address studentAddress) public view returns (string memory name, uint256 grade) {
        Student memory student = students[studentAddress];
        return (student.name, student.grade);
    }
}
