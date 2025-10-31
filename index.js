import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {sequelize} from './src/config/conection.js';
import { userRoute } from './src/routes/userRoute.js';
import { packageRoute } from './src/routes/packageRoute.js';
import { webhookRouter } from './src/routes/webhookRoute.js';
import { paymentsRoute } from './src/routes/paymentsRoute.js';
import { classesRoute } from './src/routes/classesRoute.js';

console.log('Starting the server nbdance&fitness...');

const app = express();
dotenv.config();

const port = process.env.SERVER_PORT || 3000; 
    
// conection database
try {
    await sequelize.authenticate();
    console.log('Database conection has been established successfully.')
} catch (error) {
    console.error(`unable to connect to the database: ${error.message}`);
}

app.use('/api/webhooks', webhookRouter);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use('/api/users', userRoute);
app.use('/api/packages', packageRoute);
app.use('/api/payments', paymentsRoute);
app.use('/api/classes', classesRoute);


app.get('/success', (req,res)=>{
    res.status(200).json({
        message: 'Payment successful'
    })
})
app.get('/cancel', (req,res)=>{
    res.status(200).json({
        message: 'Payment canceled'
    })
})

app.get('/',(req, res)=> {
    res.json({
        message: 'Welcome to the nury barragan dance and fitness app backend server',
    })
});

app.listen(port, ()=>{
    console.log(`Server listening in the port ${port}`)
});