const SibApiV3Sdk = require("sib-api-v3-sdk");

const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = process.env.SMTP_PASS;

const sendEmail = async ({ to, subject, html }) => {
    const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();

    await emailApi.sendTransacEmail({
        sender: {
            name: "Amebonaija",
            email: process.env.SMTP_USER,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
    });
};

module.exports = { sendEmail };