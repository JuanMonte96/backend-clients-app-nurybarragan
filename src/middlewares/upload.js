import multer from "multer";
import path from "path"
import fs from "fs"

const uplaodDir = path.join(process.cwd(), "upload/medical-certificates");

if (!fs.existsSync(uplaodDir)) {
    fs.mkdirSync(uplaodDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null,uplaodDir)
    },
    filename: (req,file,cb)=>{
        const ext = path.extname(file.originalname);
        const filename = `cert_${file.originalname}_${Date.now()}${ext}`;
        cb(null,filename); 
    }
})

export const uploadMedicalCertificated = multer({
    storage,
    limits:{fileSize:5*1024*1024},
    fileFilter:(req,file,cb)=>{
        const allowed = ["application/pdf", "image/png","image/jpeg","image/jpg"]
        if(!allowed.includes(file.mimetype)){
            cb(new Error("Only we cant accept PDF, PNG, JPEG, JPG"));
        }else{
            cb(null,true)
        }
    }
}) 

// Esto se va a usar cuando se vaya a desplegar
// const storage = multer.memoryStorage();

// export const uplaodMedicalCertificated = multer({
//     storage,
//     limits: {
//         fileSize: 5 * 1024 * 1024
//     },
//     fileFilter: (req, file, cb) => {
//         const allowTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];



//     }

// })