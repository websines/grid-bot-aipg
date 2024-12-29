export const exchange = 'xt';
export const exchange_apiKey = process.env.EXCHANGE_API_KEY;
export const exchange_secretKey = process.env.EXCHANGE_SECRET_KEY;

// Exchange configuration
export const exchangeConfig = {
    enableRateLimit: true,
    timeout: 30000,
    urls: {
        api: {
            public: 'https://sapi.xt.com/v4/public',
            private: 'https://sapi.xt.com/v4/private',
        }
    },
    headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    },
    options: {
        defaultType: 'spot',
        adjustForTimeDifference: true,
        recvWindow: 60000,
        createMarketBuyOrderRequiresPrice: true
    },
    requiredCredentials: {
        apiKey: true,
        secret: true
    }
};