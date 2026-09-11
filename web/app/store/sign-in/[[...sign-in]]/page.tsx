import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#4B2354] p-4">
      <SignIn
        routing="path"
        path="/store/sign-in"
        signUpUrl="/store/sign-up"
        fallbackRedirectUrl="https://allibuild.com/dpstore/"
      />
    </div>
  );
}
