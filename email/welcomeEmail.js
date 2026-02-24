 const welcomeEmail = (firstName) => `
    <div style="font-family: sans-serif; max-width: 480px; margin: auto; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
        
        <!-- HEADER -->
        <div style="background: #16a34a; padding: 32px 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Amebonaija</h1>
            <p style="color: #bbf7d0; margin: 6px 0 0; font-size: 14px;">Nigeria's #1 Gist Platform</p>
        </div>

        <!-- BODY -->
        <div style="padding: 32px 24px;">
            <h2 style="color: #111827; margin: 0 0 8px;">Welcome, ${firstName}! 🎉</h2>
            <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                Your account has been created successfully. You're now part of the Amebonaija family —
                where the real naija gist lives.
            </p>

            <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                Here's what you can do:
            </p>

            <ul style="color: #4b5563; font-size: 15px; line-height: 2; padding-left: 20px;">
                <li>✍️ Write and submit your own posts</li>
                <li>🔥 Read the latest naija gist</li>
                <li>💬 Comment and engage with other users</li>
                <li>📤 Share stories with your people</li>
            </ul>

            <!-- CTA BUTTON -->
            <div style="text-align: center; margin: 32px 0;">
                <a href="${process.env.FRONTEND_URL}/login"
                   style="display: inline-block; padding: 14px 32px;
                          background: #16a34a; color: white; border-radius: 6px;
                          text-decoration: none; font-weight: bold; font-size: 15px;">
                    Start Reading
                </a>
            </div>

            <p style="color: #9ca3af; font-size: 13px; line-height: 1.6;">
                If you didn't create this account, you can safely ignore this email.
                No action is needed.
            </p>
        </div>

        <!-- FOOTER -->
        <div style="background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px 24px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} Amebonaija. All rights reserved.
            </p>
        </div>

    </div>
`.trim();

module.exports = welcomeEmail;