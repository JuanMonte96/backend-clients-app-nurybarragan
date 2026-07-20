import multer from "multer";
//import path from "path"
//import fs from "fs"

// const uplaodDir = path.join(process.cwd(), "upload/medical-certificates");

// if (!fs.existsSync(uplaodDir)) {
//     fs.mkdirSync(uplaodDir, { recursive: true });
// }

// const storage = multer.diskStorage({
//     destination:(req,file,cb)=>{
//         cb(null,uplaodDir)
//     },
//     filename: (req,file,cb)=>{
//         const ext = path.extname(file.originalname);
//         const filename = `cert_${file.originalname}_${Date.now()}${ext}`;
//         cb(null,filename); 
//     }
// })

const allowedMimeTypes = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg"
]);

const storage = multer.memoryStorage();

export const uploadMedicalCertificated = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            return cb(new Error("Only PDF, PNG, JPEG, JPG files are accepted"));
        } else {
            cb(null, true)
        }
    }
}) 
