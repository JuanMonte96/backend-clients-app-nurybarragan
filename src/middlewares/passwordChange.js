export const verifyChangePassword  = (req, res, next) => {
    
    const passwordConfirmation = req.user.must_change_pass;  

    if(passwordConfirmation){
        return res.status(400).json({
            status: 'bad request',
            message: 'you must change your password'
        })
    }
    next();
} 