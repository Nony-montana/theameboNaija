const ejs = require('ejs')
const path = require ("path")


const mailSender= async(templateName, data)=>{
    try {
        const templatePath = path.join(__dirname, "/views", templateName)
        const file = await ejs.renderFile(templatePath, data)

        return file;
        
    } catch (error) {
        console.log("Error rendering template:", error);
        throw error;
        
    }
}

module.exports= mailSender;