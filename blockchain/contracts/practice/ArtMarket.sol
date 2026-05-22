// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Exercise: NFT art marketplace — mint, buy, transfer ownership
contract ArtMarket {

    uint256 public nextArtId;

    struct Artwork {
        address payable artist;
        string title;
        string ipfsHash;
        address currentOwner;
        uint256 price;
    }

    mapping(uint256 => Artwork) public artworks;

    event ArtworkCreated(uint256 indexed id, address indexed artist, string title, uint256 price);
    event ArtworkSold(uint256 indexed id, address indexed buyer, uint256 price);

    function createArtwork(string memory title, string memory ipfsHash, uint256 _price) public {
        artworks[nextArtId] = Artwork(
            payable(msg.sender),
            title,
            ipfsHash,
            msg.sender,
            _price
        );
        emit ArtworkCreated(nextArtId, msg.sender, title, _price);
        nextArtId++;
    }

    function buyArtwork(uint256 artworkId) public payable {
        Artwork storage artwork = artworks[artworkId];
        require(artwork.currentOwner != address(0), "Artwork does not exist");
        require(artwork.currentOwner != msg.sender, "You already own this artwork");
        require(msg.value >= artwork.price, "Insufficient payment");

        artwork.currentOwner = msg.sender;

        // Pay the artist (original creator always receives funds)
        artwork.artist.transfer(msg.value);

        emit ArtworkSold(artworkId, msg.sender, msg.value);
    }

    function getArtwork(uint256 artworkId) public view returns (
        address artist,
        string memory title,
        string memory ipfsHash,
        address currentOwner,
        uint256 price
    ) {
        Artwork memory a = artworks[artworkId];
        return (a.artist, a.title, a.ipfsHash, a.currentOwner, a.price);
    }
}
