import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export const auth = (req, res, next) => {
    const authHeader = req.headers["authorization"];    

    const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"
   

    if (!token) return res.status(401).json({ status: 'Unauthorized', message: 'token missing' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ status: 'Forbidden', message: 'token invalid or expired' });
        }
        req.user = user; // aquí está el payload { id, email, role }

        next();
    });
};