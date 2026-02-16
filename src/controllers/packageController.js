import { db } from "../models/db.js";
import { createProduct } from "../services/stripe.js";

export const createPackage = async (req, res) => {
    try {
        const { name, descriptionEnglish, descriptionSpanish, descriptionFrench, price, duration, class_limit } = req.body;
        const Package = db.Package;
        const { stripeProduct, stripePrice, productFromStripe } = await createProduct({
            name,
            description: descriptionEnglish,
            price
        });

        const newPackage = await Package.create({
            name_package: name,
            description_english: descriptionEnglish,
            description_spanish: descriptionSpanish,
            description_french: descriptionFrench,
            price_package: price,
            duration_package: duration,
            class_limit: class_limit,
            stripe_product_id: stripeProduct.id,
            stripe_price_id: stripePrice.id
        });

        return res.status(201).json({
            status: 'Success',
            message: 'Package created successfully',
            package: newPackage,
            stripeProduct: productFromStripe
        })
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error.message
        })
    }

};

export const getPackages = async (req, res) => {
    try {
        const packages = await db.Package.findAll();

        if (packages.length === 0) {
            return res.status(204).json({
                status: 'No content',
                message: 'No packages found'
            })
        }
        return res.status(200).json({
            status: 'success',
            packages
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error.message
        })
    }
};

