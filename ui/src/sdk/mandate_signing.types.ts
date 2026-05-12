/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/mandate_signing.json`.
 */
export type MandateSigning = {
  "address": "22m5A3ezi2qoBKESrQbQ1g5jwQ9denrwegpSm7yrC9Eh",
  "metadata": {
    "name": "mandateSigning",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "createMandate",
      "docs": [
        "Create a mandate defining what an agent is allowed to sign."
      ],
      "discriminator": [
        230,
        170,
        158,
        68,
        33,
        169,
        16,
        158
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "agent"
        },
        {
          "name": "mandate",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  110,
                  100,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createMandateArgs"
            }
          }
        }
      ]
    },
    {
      "name": "submitRequest",
      "docs": [
        "Submit a transaction request for mandate evaluation.",
        "If approved, Ika produces a signature for the target chain.",
        "Every decision is logged on-chain regardless of outcome."
      ],
      "discriminator": [
        122,
        30,
        180,
        251,
        206,
        230,
        254,
        57
      ],
      "accounts": [
        {
          "name": "agent",
          "docs": [
            "Agent identity keypair — must match mandate.agent."
          ],
          "signer": true
        },
        {
          "name": "mandate",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  110,
                  100,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mandate.owner",
                "account": "mandate"
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "dailyUsage",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  105,
                  108,
                  121,
                  95,
                  117,
                  115,
                  97,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mandate"
              },
              {
                "kind": "arg",
                "path": "day"
              }
            ]
          }
        },
        {
          "name": "decisionLog",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  99,
                  105,
                  115,
                  105,
                  111,
                  110,
                  95,
                  108,
                  111,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "mandate"
              },
              {
                "kind": "arg",
                "path": "requestNonce"
              }
            ]
          }
        },
        {
          "name": "feePayer",
          "docs": [
            "Pays for PDA creation. May be the agent or a relayer."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "request",
          "type": {
            "defined": {
              "name": "transactionRequest"
            }
          }
        },
        {
          "name": "requestNonce",
          "type": "u64"
        },
        {
          "name": "day",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "dailyUsage",
      "discriminator": [
        72,
        70,
        110,
        245,
        215,
        61,
        237,
        118
      ]
    },
    {
      "name": "decisionLog",
      "discriminator": [
        99,
        128,
        184,
        1,
        73,
        33,
        247,
        192
      ]
    },
    {
      "name": "mandate",
      "discriminator": [
        113,
        216,
        98,
        159,
        185,
        63,
        55,
        18
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorizedAgent",
      "msg": "Agent pubkey does not match mandate.agent"
    },
    {
      "code": 6001,
      "name": "mandateExpired",
      "msg": "Mandate has expired"
    },
    {
      "code": 6002,
      "name": "tokenNotAllowed",
      "msg": "Token mint is not in the mandate's allowed list"
    },
    {
      "code": 6003,
      "name": "counterpartyNotAllowed",
      "msg": "Counterparty is not in the mandate's allowed list"
    },
    {
      "code": 6004,
      "name": "tradeSizeExceeded",
      "msg": "Trade size exceeds mandate max_trade_size"
    },
    {
      "code": 6005,
      "name": "dailyVolumeExceeded",
      "msg": "Request would exceed daily volume limit"
    },
    {
      "code": 6006,
      "name": "invalidDay",
      "msg": "Provided day does not match current on-chain clock day"
    },
    {
      "code": 6007,
      "name": "tooManyTokenMints",
      "msg": "Allowed token mint list exceeds maximum of 8"
    },
    {
      "code": 6008,
      "name": "tooManyCounterparties",
      "msg": "Allowed counterparty list exceeds maximum of 4"
    }
  ],
  "types": [
    {
      "name": "createMandateArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maxTradeSizeBps",
            "docs": [
              "Max single trade as basis points (e.g. 1000 = 10%). EUint64."
            ],
            "type": "u64"
          },
          {
            "name": "dailyVolumeLimitBps",
            "docs": [
              "Daily volume cap as basis points (e.g. 2500 = 25%). EUint64."
            ],
            "type": "u64"
          },
          {
            "name": "expiryTimestamp",
            "docs": [
              "Unix timestamp this mandate expires. EUint64."
            ],
            "type": "u64"
          },
          {
            "name": "allowedTokenMints",
            "docs": [
              "Encrypted token mint allowlist (EAddress). Max 8. Empty = no token restriction."
            ],
            "type": {
              "vec": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          },
          {
            "name": "allowedCounterparties",
            "docs": [
              "Encrypted counterparty allowlist (EAddress). Max 4. Empty = no counterparty restriction."
            ],
            "type": {
              "vec": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          },
          {
            "name": "dwalletId",
            "docs": [
              "Ika dWallet to be controlled by this mandate program."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "dailyUsage",
      "docs": [
        "Daily volume consumed by an agent per mandate.",
        "PDA: [DAILY_USAGE_SEED, mandate, day_le_bytes]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mandate",
            "type": "pubkey"
          },
          {
            "name": "day",
            "docs": [
              "Day number (unix_timestamp / 86400)."
            ],
            "type": "u64"
          },
          {
            "name": "usedBps",
            "docs": [
              "Volume used today as basis points. EUint64."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "decisionLog",
      "docs": [
        "Immutable on-chain record of every mandate evaluation.",
        "PDA: [DECISION_LOG_SEED, mandate, nonce_le_bytes]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mandate",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "u64"
          },
          {
            "name": "requestHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "approved",
            "type": "bool"
          },
          {
            "name": "rejectionFlags",
            "docs": [
              "Bitmask of rejection reasons (see `rejection` module). 0 if approved."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "mandate",
      "docs": [
        "User-defined mandate: what an agent is allowed to sign.",
        "Numeric limits are EUint64; token/counterparty lists are EAddress arrays.",
        "All encrypted fields are pre-alpha plaintext with the production interface."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "User who controls this mandate."
            ],
            "type": "pubkey"
          },
          {
            "name": "agent",
            "docs": [
              "Authorized agent — submits requests, never holds signing keys."
            ],
            "type": "pubkey"
          },
          {
            "name": "dwalletId",
            "docs": [
              "Ika dWallet ID controlled by this mandate program."
            ],
            "type": "pubkey"
          },
          {
            "name": "maxTradeSizeBps",
            "docs": [
              "Max single trade as basis points of portfolio. EUint64."
            ],
            "type": "u64"
          },
          {
            "name": "dailyVolumeLimitBps",
            "docs": [
              "Daily total volume cap as basis points of portfolio. EUint64."
            ],
            "type": "u64"
          },
          {
            "name": "expiryTimestamp",
            "docs": [
              "Unix timestamp after which mandate expires. EUint64."
            ],
            "type": "u64"
          },
          {
            "name": "allowedTokenMints",
            "docs": [
              "Encrypted token mint allowlist (EAddress × 8). Empty = no token restriction."
            ],
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                8
              ]
            }
          },
          {
            "name": "allowedTokenCount",
            "type": "u8"
          },
          {
            "name": "allowedCounterparties",
            "docs": [
              "Encrypted counterparty allowlist (EAddress × 4). Empty = no counterparty restriction."
            ],
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                4
              ]
            }
          },
          {
            "name": "allowedCounterpartyCount",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tradeDirection",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buy"
          },
          {
            "name": "sell"
          }
        ]
      }
    },
    {
      "name": "transactionRequest",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenMint",
            "docs": [
              "Token mint being traded. Checked against mandate's encrypted allowlist."
            ],
            "type": "pubkey"
          },
          {
            "name": "counterparty",
            "docs": [
              "Destination address or program. Checked against mandate's encrypted counterparty list."
            ],
            "type": "pubkey"
          },
          {
            "name": "sizeBps",
            "docs": [
              "Trade size as basis points of portfolio."
            ],
            "type": "u64"
          },
          {
            "name": "direction",
            "type": {
              "defined": {
                "name": "tradeDirection"
              }
            }
          },
          {
            "name": "targetChain",
            "docs": [
              "Target chain (0 = Solana, 1 = Ethereum, 2 = BNB, …)."
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};
