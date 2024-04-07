export const verifyAdmin = (password: string) => {
    return password === process.env.ADMIN_PASSWORD
}