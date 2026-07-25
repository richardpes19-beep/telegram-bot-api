require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const app = express();

app.use(cors());
app.use(express.json());


const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;


// COLE SUA STRING SESSION AQUI
const stringSession = new StringSession(
"1AQAOMTQ5LjE1NC4xNzUuNTQBu5H+8CJ+MJN3o51ui9I1Aw2ReL8jaNQQWi9zk/nxMX7OmEEiLkbyCtjDdnrey/paeX2yqD3D3gzPbDIltM3BrF4NkYqSPfnY0HYi6x7+14fSfJ9kWz/m5dOfV9R4eLWti/HXaEwifSkbfMONr2YuI1rQFG/3kbU/8sEO7d1JU18eqfKL/SZ6DKVZnX0hTk8I8o+png7GqOCj2FPbjvG95yW1Bf5pxFDrwEevWkxbEWl1+JMDotdmNwH6ICHtrQTotoxgDo9RIpH+Ea6JPiWhVqqyjMf8x07pnqZihhfhGmTjemLrPSkqaIQTcO35IkhupJDHP+fOAjmfyoNChht85aY="
);


const client = new TelegramClient(
    stringSession,
    apiId,
    apiHash,
    {
        connectionRetries: 5,
    }
);


let bot;


function esperar(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}



async function gerarPix(valor){


    await client.sendMessage(bot,{
        message:"/start"
    });


    await esperar(3000);



    const mensagens = await client.getMessages(bot,{
        limit:5
    });



    let mensagemMenu;
    let botaoDepositar;


    for(const msg of mensagens){


        if(!msg.replyMarkup) continue;


        mensagemMenu = msg;


        for(const row of msg.replyMarkup.rows){


            for(const button of row.buttons){


                if(button.text.includes("DEPOSITAR")){

                    botaoDepositar = button;

                }

            }

        }

    }



    if(!botaoDepositar){

        return {
            sucesso:false,
            erro:"Botão 📥 DEPOSITAR não encontrado"
        };

    }



    await client.invoke(
        new Api.messages.GetBotCallbackAnswer({

            peer: bot,

            msgId: mensagemMenu.id,

            data: botaoDepositar.data

        })
    );



    await esperar(3000);



    await client.sendMessage(bot,{
        message:String(valor)
    });



    await esperar(5000);



    const novasMensagens = await client.getMessages(bot,{
        limit:10
    });



    for(const msg of novasMensagens){


        if(
            msg.message &&
            msg.message.includes("PIX Copia e Cola:")
        ){


            const pix = msg.message
            .split("PIX Copia e Cola:")[1]
            .trim();



            return {

                sucesso:true,

                valor,

                pix

            };

        }

    }



    return {

        sucesso:false,

        erro:"PIX não encontrado"

    };


}




(async()=>{


    await client.connect();


    console.log("Telegram conectado!");



    bot = await client.getEntity(
        "VortexBank_bot"
    );


    console.log(
        "Bot:",
        bot.username
    );



    app.get("/",(req,res)=>{

        res.send("API ONLINE");

    });



    app.post("/deposito",async(req,res)=>{


        try{


            const {valor}=req.body;



            if(!valor){

                return res.status(400).json({

                    sucesso:false,

                    erro:"Informe o valor"

                });

            }



            const resultado = await gerarPix(valor);



            res.json(resultado);



        }catch(err){


            console.log(err);


            res.status(500).json({

                sucesso:false,

                erro:err.message

            });


        }


    });




    app.listen(3000,()=>{


        console.log(
            "Servidor rodando em http://localhost:3000"
        );


    });



})();