-- Seed: 001_seed_chains
-- Description: Insert supported blockchain networks
-- Author: Assetro Platform
-- Date: 2026-04-11

BEGIN;

INSERT INTO public.supported_chains (name, chain_id, rpc_url, explorer_url, is_testnet, is_active, native_currency)
VALUES
    (
        'Ethereum Mainnet',
        1,
        'https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}',
        'https://etherscan.io',
        false,
        true,
        'ETH'
    ),
    (
        'Ethereum Sepolia',
        11155111,
        'https://sepolia.infura.io/v3/${INFURA_PROJECT_ID}',
        'https://sepolia.etherscan.io',
        true,
        true,
        'ETH'
    ),
    (
        'Polygon Mainnet',
        137,
        'https://polygon-rpc.com',
        'https://polygonscan.com',
        false,
        true,
        'MATIC'
    ),
    (
        'Polygon Amoy',
        80002,
        'https://rpc-amoy.polygon.technology',
        'https://amoy.polygonscan.com',
        true,
        true,
        'MATIC'
    ),
    (
        'Bharat Blockchain',
        8888,
        'https://rpc.bharatblockchain.io',
        'https://explorer.bharatblockchain.io',
        false,
        true,
        'BHRT'
    )
ON CONFLICT (chain_id) DO NOTHING;

COMMIT;
