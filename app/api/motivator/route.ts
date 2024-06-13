import { unstable_noStore as noStore } from 'next/cache';
import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres';
import OpenAI from 'openai'

import { prompts } from '@/app/lib/constants/prompts';

async function checkExistingMotivators(frase: string): Promise<boolean> {
    // Check if the frase already exists in the motivators table
    const existingMotivators = await sql<{ frase: string }[]>`
        SELECT * FROM motivators WHERE frase = ${frase}
    `;
    
    return existingMotivators.rowCount > 0;
}

async function generateUniqueMotivator(maxAttempts: number = 5): Promise<string> {
    let attempts = 0;
    let generatedPhrase: string | undefined;

    while (attempts < maxAttempts) {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'user',
                    content: `${randomPrompt}`
                }
            ],
            temperature: 0,
            max_tokens: 1024,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });

        generatedPhrase = response.choices[0].message.content?.trim();

        if (generatedPhrase) {
            const exists = await checkExistingMotivators(generatedPhrase);
            if (!exists) {
                return generatedPhrase;
            }
        } else {
            throw new Error('Failed to generate a phrase.');
        }

        attempts++;
    }
    
    console.log('Failed to generate a unique phrase within the maximum attempts limit.', attempts)

    throw new Error(`Failed to generate a unique phrase within the maximum attempts limit. ${attempts}`);
    // return NextResponse.json(`Failed to generate a unique phrase within the maximum attempts limit. ${attempts}`)
}


async function saveMotivatorToDB(frase: string) {
    // Insert data into the database
    noStore()
    try {
        await sql`
        INSERT INTO motivators (frase, created_at)
        VALUES (${frase}, NOW())
      `;
    } catch (error) {
        console.log('error:', error)
        return NextResponse.json(error)
    }
}

export async function GET(): Promise<NextResponse> {
    noStore();
    try {
        // Generate a unique motivator phrase with a maximum of 5 attempts
        const motivator = await generateUniqueMotivator(5);
        
        // Save the unique motivator to the database
        await saveMotivatorToDB(motivator);

        // Return the generated phrase as the response
        return NextResponse.json({ motivator });
    } catch (error) {
        if ((error as Error).message !== 'Failed to generate a unique phrase within the maximum attempts limit.') {
            // Only return the error if it's not the specific error we want to ignore
            return NextResponse.json({ error: (error as Error).message });
        } else {
            // Handle the specific error here, you can log it or return a different response
            return NextResponse.json({ status: 500, message: (error as Error).message });
        }
    }
}
