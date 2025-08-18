import {db} from "../models/db.js";
import { createProduct } from "../services/stripe.js";

export const createPackage = async (req, res) => {
    try {
        const { name, description, price, duration, class_limit } = req.body;
        const Package = db.Package;
        const { stripeProduct, stripePrice } = await createProduct({
            name,
            description,
            price
        });

        const newPackage = await Package.create({
            name_package: name,
            description_package: description,
            price_package: price,
            duration_package: duration,
            class_limit: class_limit,
            stripe_product_id: stripeProduct.id,
            stripe_price_id: stripePrice.id
        });

        return res.status(201).json({
            status: 'Success',
            message: 'Package created successfully',
            package: newPackage
        })
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error.message
        })
    }

}