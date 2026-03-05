const express = require ('express');
const app = express();
const ejs = require('ejs');
const dotenv = require('dotenv');
const mongoose = require("mongoose");
const cors = require("cors");
app.set('view engine', 'ejs');
dotenv.config();
app.use(express.urlencoded({limit:"5mb" ,extended:true}));
app.use(express.json({limit:"50mb"}));
app.use(cors({
    origin:["https://amebonaija.vercel.app", "http://localhost:5173"],
    credentials: true
}));
const UserRouter =require("./routers/user.routes");
const PostRouter =require("./routers/post.routes");
const authRoutes = require("./routers/auth.routes");
app.use('/api/v1', UserRouter)
app.use('/api/v1', PostRouter)
app.use("/api/v1/auth", authRoutes);



app.listen(process.env.PORT, (err)=>{
    if(err){
        console.log('error starting server', err)
    }else{
        console.log(`server started successfully`);
    }

})



mongoose.connect(process.env.DATABASE_URI)
.then(()=>{
    console.log("Database connected successfully")
})
.catch(()=>{
    console.log("Failed to connect to DB")
})

    // origin:"http://localhost:5173", 
    // credentials:true