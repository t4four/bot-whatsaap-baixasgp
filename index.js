const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const request = require('request');

const client = new Client({
    authStrategy: new LocalAuth()
});

const targetGroupId = '120363030762048786@g.us'; // Substitua pelo ID do grupo desejado

const getCurrentDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Mês começa do 0, então adicionamos 1
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; // Formato YYYY-MM-DD
};

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('message_create', message => {
    // Verifique se a mensagem é do grupo específico
    if (message.from === targetGroupId || message.to === targetGroupId) {
        console.log(message.body);

        // Verifique se a mensagem começa com !liberar
        if (message.body.startsWith('!b')) {
            // Extraia o nome do cliente
            const parts = message.body.split(' ');
            if (parts.length > 1) {
                const clienteNome = parts.slice(1).join(' ');
                console.log(`Nome a ser consultado: ${clienteNome}`);
                
                // Realize a solicitação à API do SGP
                const consultOptions = {
                    method: 'POST',
                    url: 'https://japura.sgp.tsmx.com.br/api/ura/consultacliente/',
                    headers: {},
                    formData: {
                        'app': 'apicadastro',
                        'token': '84b84f51-ff5f-456c-bc5b-33387ceda07c',
                        'nome': clienteNome
                    }
                };

                request(consultOptions, function (error, response) {
                    if (error) {
                        console.error('Error making API request:', error);
                        client.sendMessage(targetGroupId, 'Erro ao consultar o cliente. Por favor, tente novamente mais tarde.').catch(err => console.error('Error sending message:', err));
                        return;
                    }
                    
                    // Verifique se a resposta é JSON
                    try {
                        const result = JSON.parse(response.body);
                        console.log(result);

                        if (result && result.contratos && result.contratos.length > 0) {
                            const clienteNome = result.contratos[0].razaoSocial;
                            const clienteId = result.contratos[0].clienteId;

                            // Realize a solicitação à API para obter os títulos do cliente
                            const tituloOptions = {
                                method: 'POST',
                                url: 'https://japura.sgp.tsmx.com.br/api/ura/titulos/',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    app: 'apicadastro',
                                    token: '84b84f51-ff5f-456c-bc5b-33387ceda07c',
                                    cliente_id: clienteId, // Corrigido para 'cliente_id'
                                    limit: 250,
                                    status: 'abertos' // Adicionado filtro de status
                                })
                            };

                            request(tituloOptions, function (tituloError, tituloResponse) {
                                if (tituloError) {
                                    console.error('Error making API request for titles:', tituloError);
                                    client.sendMessage(targetGroupId, 'Erro ao consultar os títulos do cliente. Por favor, tente novamente mais tarde.').catch(err => console.error('Error sending message:', err));
                                    return;
                                }

                                // Verifique se a resposta é JSON
                                try {
                                    const tituloResult = JSON.parse(tituloResponse.body);
                                    console.log(tituloResult);

                                    if (tituloResult && tituloResult.titulos && tituloResult.titulos.length > 0) {
                                        const numeroTitulos = tituloResult.titulos.length;
                                        const titulosParaExibir = tituloResult.titulos.slice(0, 10); // Exibir apenas os 10 primeiros títulos
                                        const titulos = titulosParaExibir.map(titulo => {
                                            return {
                                                id: titulo.id,
                                                numero: titulo.numeroDocumento
                                            };
                                        });
                                        const numerosTitulos = titulosParaExibir.map(titulo => titulo.numero).join(', ');

                                        const mensagem = `Cliente ${clienteNome} liberado com sucesso! Quantidade de títulos em aberto: ${numeroTitulos}. Números dos títulos: ${numerosTitulos}`;
                                        client.sendMessage(targetGroupId, mensagem).catch(err => console.error('Error sending message:', err));

                                        // Adicione a lógica para dar baixa nos títulos
                                        const currentDate = getCurrentDate();
                                        const valorPago = 210.00;
                                        const formaPagamento = 'DINHEIRO'; // Substitua pela forma de pagamento adequada
                                        const tarifas = 1;

                                        titulos.forEach(titulo => {
                                            const baixaOptions = {
                                                method: 'POST',
                                                url: `https://japura.sgp.tsmx.com.br/api/banco/titulo/${titulo.id}/baixar/`,
                                                headers: {
                                                    'Content-Type': 'application/json'
                                                },
                                                body: JSON.stringify({
                                                    app: 'apicadastro',
                                                    token: '84b84f51-ff5f-456c-bc5b-33387ceda07c',
                                                    data_pagamento: currentDate, // Data atual
                                                    valor_pago: valorPago, // Valor constante
                                                    forma_pagamento: formaPagamento, // Forma de pagamento constante
                                                    ponto_recebimento: 1,
                                                    tarifas: tarifas // Tarifas constantes
                                                })
                                            };

                                            request(baixaOptions, function (baixaError, baixaResponse) {
                                                if (baixaError) {
                                                    console.error(`Error making API request to baixa titulo ${titulo.id}:`, baixaError);
                                                    client.sendMessage(targetGroupId, `Erro ao dar baixa no título ${titulo.numero}. Por favor, tente novamente mais tarde.`).catch(err => console.error('Error sending message:', err));
                                                    return;
                                                }

                                                console.log(`Baixa do título ${titulo.id} concluída:`, baixaResponse.body);
                                                client.sendMessage(targetGroupId, `Título ${titulo.numero} baixado com sucesso!`).catch(err => console.error('Error sending message:', err));
                                            });
                                        });
                                    } else {
                                        client.sendMessage(targetGroupId, `Cliente ${clienteNome} liberado com sucesso! No entanto, não foram encontrados títulos em aberto para este cliente.`).catch(err => console.error('Error sending message:', err));
                                    }
                                } catch (tituloParseError) {
                                    console.error('Error parsing titles API response:', tituloParseError);
                                    client.sendMessage(targetGroupId, 'Erro ao processar a resposta dos títulos do cliente. Por favor, tente novamente mais tarde.').catch(err => console.error('Error sending message:', err));
                                }
                            });
                        } else { 
                            client.sendMessage(targetGroupId, 'Cliente não encontrado. Por favor, verifique o nome e tente novamente.').catch(err => console.error('Error sending message:', err));
                        }
                    } catch (parseError) {
                        console.error('Error parsing API response:', parseError);
                        client.sendMessage(targetGroupId, 'Erro ao processar a resposta da consulta do cliente. Por favor, tente novamente mais tarde.').catch(err => console.error('Error sending message:', err));
                    }
                });
            } else {
                client.sendMessage(targetGroupId, 'Por favor, forneça o nome do cliente após o comando !liberar.').catch(err => console.error('Error sending message:', err));
            }
        }
    }
});

client.initialize().catch(err => console.error('Error initializing client:', err));
