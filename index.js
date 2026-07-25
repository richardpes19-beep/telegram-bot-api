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


// =======================================================
// COLE SUA STRING SESSION AQUI
// =======================================================
const stringSession = new StringSession(
    "COLE_SUA_STRING_SESSION_AQUI"
);
// =======================================================


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

    console.log("GERANDO PIX:", valor);


    await client.sendMessage(bot,{
        message:"/start"
    });

    console.log("START enviado");


    await esperar(3000);



    const mensagens = await client.getMessages(bot,{
        limit:10
    });



    let mensagemMenu;
    let botaoDepositar;



    for(const msg of mensagens){


        if(!msg.replyMarkup) continue;


        mensagemMenu = msg;



        for(const row of msg.replyMarkup.rows){


            for(const button of row.buttons){


                console.log("BOTAO ENCONTRADO:", button.text);



                if(button.text.includes("DEPOSITAR")){

                    botaoDepositar = button;

                }

            }

        }

    }



    if(!botaoDepositar){

        console.log("NAO ACHOU BOTAO DEPOSITAR");


        return {
            sucesso:false,
            erro:"Botão 📥 DEPOSITAR não encontrado"
        };

    }



    console.log("CLICANDO NO DEPOSITAR");


    // guarda o id da mensagem do menu ANTES do clique, pra comparar depois
    const idAntesDoClique = mensagemMenu.id;


    await client.invoke(
        new Api.messages.GetBotCallbackAnswer({

            peer: bot,

            msgId: mensagemMenu.id,

            data: botaoDepositar.data

        })
    );



    console.log("DEPOSITAR CLICADO");



    // espera mais tempo pro bot mandar a pergunta do valor
    await esperar(6000);



    console.log("BUSCANDO MENSAGEM QUE PEDE O VALOR");


    const mensagensPosClique = await client.getMessages(bot,{
        limit:10
    });


    // pega a mensagem mais recente que apareceu DEPOIS do clique
    let mensagemPedeValor;

    for(const msg of mensagensPosClique){

        console.log("MSG POS CLIQUE:", msg.id, "-", msg.message?.substring(0,150));

        if(msg.id > idAntesDoClique){

            if(!mensagemPedeValor){
                mensagemPedeValor = msg;
            }

        }

    }


    if(!mensagemPedeValor){

        console.log("NAO ACHOU MENSAGEM PEDINDO O VALOR");

        return {
            sucesso:false,
            erro:"Não encontrou a mensagem que pede o valor do depósito"
        };

    }



    console.log("MANDANDO VALOR:", String(valor), "EM REPLY A:", mensagemPedeValor.id);



    await client.sendMessage(bot,{
        message: String(valor),
        replyTo: mensagemPedeValor.id   // <-- ESSENCIAL: responde direto na mensagem que pediu o valor
    });



    console.log("VALOR ENVIADO");



    await esperar(10000);



    const novasMensagens = await client.getMessages(bot,{
        limit:20
    });



    console.log("MENSAGENS RECEBIDAS:", novasMensagens.length);



    for(const msg of novasMensagens){


        console.log("MSG:", msg.message?.substring(0,150));



        if(
            msg.message &&
            msg.message.includes("PIX Copia e Cola:")
        ){


            const pix = msg.message
            .split("PIX Copia e Cola:")[1]
            .trim();



            console.log("PIX ENCONTRADO");



            return {

                sucesso:true,

                valor,

                pix

            };

        }

    }



    console.log("NAO ACHOU PIX");


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
