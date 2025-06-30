const globalErrorHandler = (error, req, res, next) => {
    console.error('Error:', error);
    
    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
    }
    
    res.status(error.status || 500).json({
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message
    });
};

module.exports = { globalErrorHandler };

