import crypto from 'crypto';
import bcrypt from 'bcrypt';


export const createTempPassword = async () => {
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    return {tempPassword, hashedPassword};
}